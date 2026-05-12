import { NextRequest, NextResponse } from 'next/server'
import { ninjaOne } from '@/lib/ninjaone'
import { getServiceSupabase } from '@/lib/supabase'

export const maxDuration = 600
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  console.log('=== NinjaOne Sync Started ===')
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.SYNC_CRON_SECRET
    
    if (authHeader && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const startTime = Date.now()

    // Clean up duplicate devices before sync
    console.log('Checking for duplicate devices...')
    const { data: allDevices } = await supabase
      .from('devices')
      .select('id, device_name, employee_id, ninja_device_id, serial_number, manufacturer, model, os_name, is_in_ninja')
      .not('employee_id', 'is', null)
    
    if (allDevices) {
      const deviceGroups = new Map<string, any[]>()
      
      for (const device of allDevices) {
        const key = `${(device.device_name || '').toLowerCase().trim()}_${device.employee_id}`
        if (!deviceGroups.has(key)) {
          deviceGroups.set(key, [])
        }
        deviceGroups.get(key)!.push(device)
      }
      
      let duplicatesMerged = 0
      for (const [, devices] of deviceGroups.entries()) {
        if (devices.length <= 1) continue
        
        const scoredDevices = devices.map((device: any) => {
          let score = 0
          if (device.ninja_device_id && !device.ninja_device_id.startsWith('manual-')) score += 100
          if (device.is_in_ninja) score += 50
          if (device.serial_number) score += 30
          if (device.manufacturer) score += 20
          if (device.model) score += 20
          if (device.os_name) score += 20
          return { device, score }
        })
        
        scoredDevices.sort((a: any, b: any) => b.score - a.score)
        const devicesToDelete = scoredDevices.slice(1).map((d: any) => d.device)
        
        for (const duplicate of devicesToDelete) {
          const { error: deleteError } = await supabase
            .from('devices')
            .delete()
            .eq('id', duplicate.id)
          
          if (!deleteError) duplicatesMerged++
        }
      }
      
      if (duplicatesMerged > 0) {
        console.log(`Cleaned up ${duplicatesMerged} duplicate device(s)`)
      }
    }

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'ninjaone',
        status: 'success',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    let recordsSynced = 0
    let recordsFailed = 0
    const errors: string[] = []

    try {
      const ninjaDevices = await ninjaOne.getDevices()
      console.log(`Fetched ${ninjaDevices.length} devices from NinjaOne`)

      const BATCH_SIZE = 10
      const batches = []
      
      for (let i = 0; i < ninjaDevices.length; i += BATCH_SIZE) {
        batches.push(ninjaDevices.slice(i, i + BATCH_SIZE))
      }

      console.log(`Processing ${ninjaDevices.length} devices in ${batches.length} batches`)

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]

        const results = await Promise.all(batch.map(async (device: any) => {
          try {
            const deviceDetails = await ninjaOne.getDevice(device.id.toString())
            const deviceName = (device.dnsName || device.systemName || '').trim()
            const deviceNameLower = deviceName.toLowerCase()
            const ninjaSerialNumber = (deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || '').trim().toUpperCase()
            
            // Match strategy:
            // 1. By ninja_device_id (exact NinjaOne ID)
            // 2. By device name (exact or case-insensitive)
            // 3. By serial number (for manually created devices)
            let existingDevice = null
            
            // 1. Match by ninja_device_id
            const { data: byNinjaId } = await supabase
              .from('devices')
              .select('id, employee_id, device_name, ninja_device_id, serial_number')
              .eq('ninja_device_id', device.id.toString())
              .maybeSingle()
            
            existingDevice = byNinjaId
            
            // 2. Match manually-created devices (manual- prefix) by name
            if (!existingDevice && deviceName) {
              const { data: manualDevices } = await supabase
                .from('devices')
                .select('id, employee_id, device_name, ninja_device_id, serial_number')
                .like('ninja_device_id', 'manual-%')
              
              if (manualDevices) {
                for (const candidate of manualDevices) {
                  const candidateName = (candidate.device_name || '').trim().toLowerCase()
                  if (candidateName === deviceNameLower) {
                    existingDevice = candidate
                    console.log(`  Matched NinjaOne device "${deviceName}" to manual device "${candidate.device_name}"`)
                    break
                  }
                }
              }
            }
            
            // 3. Match by device_name (case-insensitive) for any device
            if (!existingDevice && deviceName) {
              const { data: byName } = await supabase
                .from('devices')
                .select('id, employee_id, device_name, ninja_device_id, serial_number')
                .ilike('device_name', deviceName)
                .maybeSingle()
              
              existingDevice = byName
            }
            
            // 4. Match by serial number
            if (!existingDevice && ninjaSerialNumber && ninjaSerialNumber.length >= 4) {
              const { data: bySerial } = await supabase
                .from('devices')
                .select('id, employee_id, device_name, ninja_device_id, serial_number')
                .ilike('serial_number', ninjaSerialNumber)
                .maybeSingle()
              
              if (bySerial) {
                existingDevice = bySerial
                console.log(`  Matched NinjaOne device "${deviceName}" to existing device "${bySerial.device_name}" by serial number`)
              }
            }

            let lastSeen = null
            if (device.lastContact) {
              const timestamp = parseFloat(device.lastContact)
              lastSeen = new Date(timestamp * 1000).toISOString()
            }

            const deviceData: any = {
              ninja_device_id: device.id.toString(),
              device_name: existingDevice?.device_name || device.dnsName || device.systemName || 'Unknown Device',
              device_type: device.nodeClass || null,
              manufacturer: deviceDetails.system?.manufacturer || null,
              model: deviceDetails.system?.model || null,
              serial_number: deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || null,
              os_name: deviceDetails.os?.name || null,
              os_version: deviceDetails.os?.version || null,
              last_seen: lastSeen,
              status: 'active',
              is_in_ninja: true,
              last_synced_at: new Date().toISOString()
            }
            
            // Preserve employee assignment - NinjaOne sync never changes assignments
            if (existingDevice?.employee_id) {
              deviceData.employee_id = existingDevice.employee_id
            }

            let deviceId: string

            if (existingDevice) {
              const { error: updateError } = await supabase
                .from('devices')
                .update(deviceData)
                .eq('id', existingDevice.id)
              
              if (updateError) {
                throw new Error(`Failed to update device: ${updateError.message}`)
              }
              
              deviceId = existingDevice.id
            } else {
              const { data: newDevice, error: insertError } = await supabase
                .from('devices')
                .insert(deviceData)
                .select('id')
                .single()
              
              if (insertError) {
                throw new Error(`Failed to insert device: ${insertError.message}`)
              }
              
              deviceId = newDevice.id
            }

            // Sync software in background
            ninjaOne.getDeviceSoftware(device.id)
              .then(async (softwareList) => {
                if (!softwareList?.length) return
                
                await supabase
                  .from('device_software')
                  .delete()
                  .eq('device_id', deviceId)

                for (const sw of softwareList) {
                  try {
                    let { data: existingSoftware } = await supabase
                      .from('software')
                      .select('id')
                      .eq('name', sw.name)
                      .eq('version', sw.version || '')
                      .eq('publisher', sw.publisher || '')
                      .single()

                    let softwareId: string

                    if (existingSoftware) {
                      softwareId = existingSoftware.id
                    } else {
                      const { data: newSoftware, error: swInsertError } = await supabase
                        .from('software')
                        .insert({
                          name: sw.name,
                          version: sw.version || null,
                          publisher: sw.publisher || null
                        })
                        .select('id')
                        .single()

                      if (swInsertError || !newSoftware) continue
                      softwareId = newSoftware.id
                    }

                    await supabase
                      .from('device_software')
                      .insert({
                        device_id: deviceId,
                        software_id: softwareId,
                        install_date: sw.installDate || null,
                        last_synced_at: new Date().toISOString()
                      })
                  } catch {
                    // Silent fail for individual software items
                  }
                }
              })
              .catch(() => {})

            return { success: true, deviceId: device.id }
          } catch (error: any) {
            const errorMsg = `Failed to sync device ${device.id}: ${error.message}`
            errors.push(errorMsg)
            return { success: false, deviceId: device.id, error: errorMsg }
          }
        }))

        const batchSynced = results.filter((r: any) => r.success).length
        const batchFailed = results.filter((r: any) => !r.success).length
        recordsSynced += batchSynced
        recordsFailed += batchFailed
        
        console.log(`Batch ${batchIndex + 1}/${batches.length}: ${batchSynced} synced, ${batchFailed} failed | Total: ${recordsSynced}/${recordsFailed}`)
      }
      
      const duration = Math.floor((Date.now() - startTime) / 1000)
      const completedAt = new Date().toISOString()
      
      await supabase
        .from('sync_logs')
        .update({
          status: recordsFailed > 0 ? 'partial' : 'success',
          records_synced: recordsSynced,
          records_failed: recordsFailed,
          error_message: errors.length > 0 ? errors.join('; ') : null,
          completed_at: completedAt,
          duration_seconds: duration
        })
        .eq('id', syncLog!.id)

      console.log(`\n=== NinjaOne Sync Complete ===`)
      console.log(`Synced: ${recordsSynced} | Failed: ${recordsFailed} | Duration: ${duration}s`)

      return NextResponse.json({
        success: true,
        recordsSynced,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined
      })
    } catch (error: any) {
      const duration = Math.floor((Date.now() - startTime) / 1000)
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          records_synced: recordsSynced,
          records_failed: recordsFailed,
          error_message: error.message,
          completed_at: new Date().toISOString(),
          duration_seconds: duration
        })
        .eq('id', syncLog!.id)

      throw error
    }
  } catch (error: any) {
    console.error('NinjaOne sync error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync NinjaOne data' },
      { status: 500 }
    )
  }
}

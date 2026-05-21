import { NextRequest, NextResponse } from 'next/server'
import { getIntuneManagedDevices, IntuneManagedDevice } from '@/lib/intune'
import { getServiceSupabase } from '@/lib/supabase'

export const maxDuration = 600
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.SYNC_CRON_SECRET

    if (authHeader && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const startTime = Date.now()

    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'intune',
        status: 'success',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    let recordsSynced = 0
    let recordsFailed = 0
    let recordsSkipped = 0
    let recordsNonCompliant = 0
    let employeesMatched = 0
    const errors: string[] = []

    try {
      const intuneDevices = await getIntuneManagedDevices()

      const { data: ninjaDevices } = await supabase
        .from('devices')
        .select('id, device_name, serial_number, ninja_device_id, azure_device_id, employee_id, is_in_ninja')

      const ninjaBySerial = new Map<string, any>()
      const ninjaByName = new Map<string, any>()
      const ninjaByAzureId = new Map<string, any>()

      if (ninjaDevices) {
        for (const d of ninjaDevices) {
          if (d.azure_device_id) {
            ninjaByAzureId.set(d.azure_device_id.toLowerCase(), d)
          }
          if (d.serial_number) {
            ninjaBySerial.set(d.serial_number.trim().toUpperCase(), d)
          }
          if (d.device_name) {
            ninjaByName.set(d.device_name.trim().toLowerCase(), d)
          }
        }
      }

      const { data: employees } = await supabase
        .from('employees')
        .select('id, email, display_name')

      const employeeByEmail = new Map<string, { id: string; display_name: string | null }>()
      if (employees) {
        for (const emp of employees) {
          if (emp.email) {
            employeeByEmail.set(emp.email.toLowerCase(), emp)
          }
        }
      }

      const BATCH_SIZE = 20
      for (let i = 0; i < intuneDevices.length; i += BATCH_SIZE) {
        const batch = intuneDevices.slice(i, i + BATCH_SIZE)

        const results = await Promise.all(
          batch.map(async (intuneDevice: IntuneManagedDevice) => {
            try {
              const isCompliant = intuneDevice.complianceState === 'compliant'

              if (!isCompliant) {
                return { success: true, action: 'nonCompliant' }
              }

              const azureDeviceId = intuneDevice.azureADDeviceId || intuneDevice.id
              const deviceName = (intuneDevice.deviceName || '').trim()
              const serialNumber = (intuneDevice.serialNumber || '').trim().toUpperCase()

              let existingDevice: any = null

              if (azureDeviceId) {
                existingDevice = ninjaByAzureId.get(azureDeviceId.toLowerCase()) || null
              }

              if (!existingDevice && serialNumber && serialNumber.length >= 4) {
                existingDevice = ninjaBySerial.get(serialNumber) || null
              }

              if (!existingDevice && deviceName) {
                const nameLower = deviceName.toLowerCase()
                existingDevice = ninjaByName.get(nameLower) || null

                if (!existingDevice) {
                  const shortName = nameLower.split('.')[0]
                  if (shortName !== nameLower) {
                    existingDevice = ninjaByName.get(shortName) || null
                  }
                }

                if (!existingDevice) {
                  for (const [key, val] of ninjaByName) {
                    const existingShort = key.split('.')[0]
                    if (existingShort === nameLower || key === nameLower) {
                      existingDevice = val
                      break
                    }
                  }
                }
              }

              const userEmail = (intuneDevice.userPrincipalName || '').trim().toLowerCase()
              const matchedEmployee = userEmail ? employeeByEmail.get(userEmail) : null

              if (existingDevice) {
                const updateData: any = {
                  azure_device_id: azureDeviceId,
                  last_synced_at: new Date().toISOString(),
                }

                if (!existingDevice.manufacturer && intuneDevice.manufacturer) {
                  updateData.manufacturer = intuneDevice.manufacturer
                }
                if (!existingDevice.model && intuneDevice.model) {
                  updateData.model = intuneDevice.model
                }
                if (!existingDevice.serial_number && serialNumber) {
                  updateData.serial_number = serialNumber
                }

                if (matchedEmployee && !existingDevice.employee_id) {
                  updateData.employee_id = matchedEmployee.id
                  employeesMatched++
                }

                const { error: updateError } = await supabase
                  .from('devices')
                  .update(updateData)
                  .eq('id', existingDevice.id)

                if (updateError) {
                  throw new Error(`Failed to update device: ${updateError.message}`)
                }

                if (matchedEmployee && !existingDevice.employee_id) {
                  await supabase.from('device_assignments_history').insert({
                    device_id: existingDevice.id,
                    employee_id: matchedEmployee.id,
                    azure_device_id: azureDeviceId,
                    is_current: true,
                  })
                }

                return { success: true, action: 'updated' }
              }

              const newDeviceData: any = {
                azure_device_id: azureDeviceId,
                device_name: deviceName || 'Unknown Device',
                device_type: mapIntuneDeviceType(intuneDevice),
                manufacturer: intuneDevice.manufacturer || null,
                model: intuneDevice.model || null,
                serial_number: serialNumber || null,
                os_name: intuneDevice.operatingSystem || null,
                os_version: intuneDevice.osVersion || null,
                last_seen: intuneDevice.lastSyncDateTime || null,
                status: 'active',
                is_in_ninja: false,
                last_synced_at: new Date().toISOString(),
              }

              if (matchedEmployee) {
                newDeviceData.employee_id = matchedEmployee.id
                employeesMatched++
              }

              const { data: newDevice, error: insertError } = await supabase
                .from('devices')
                .insert(newDeviceData)
                .select('id')
                .single()

              if (insertError) {
                if (insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
                  return { success: true, action: 'skipped' }
                }
                throw new Error(`Failed to insert device: ${insertError.message}`)
              }

              if (matchedEmployee && newDevice) {
                await supabase.from('device_assignments_history').insert({
                  device_id: newDevice.id,
                  employee_id: matchedEmployee.id,
                  azure_device_id: azureDeviceId,
                  is_current: true,
                })
              }

              return { success: true, action: 'created' }
            } catch (error: any) {
              errors.push(`Device ${intuneDevice.deviceName || intuneDevice.id}: ${error.message}`)
              return { success: false }
            }
          })
        )

        for (const r of results) {
          if (r.success) {
            if (r.action === 'nonCompliant') {
              recordsNonCompliant++
            } else if (r.action === 'skipped') {
              recordsSkipped++
            } else {
              recordsSynced++
            }
          } else {
            recordsFailed++
          }
        }
      }

      const duration = Math.floor((Date.now() - startTime) / 1000)

      await supabase
        .from('sync_logs')
        .update({
          status: recordsFailed > 0 ? 'partial' : 'success',
          records_synced: recordsSynced,
          records_failed: recordsFailed,
          error_message: errors.length > 0 ? errors.join('; ') : null,
          completed_at: new Date().toISOString(),
          duration_seconds: duration,
        })
        .eq('id', syncLog!.id)

      return NextResponse.json({
        success: true,
        totalIntuneDevices: intuneDevices.length,
        recordsSynced,
        recordsSkipped,
        recordsNonCompliant,
        recordsFailed,
        employeesMatched,
        duration,
        errors: errors.length > 0 ? errors : undefined,
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
          duration_seconds: duration,
        })
        .eq('id', syncLog!.id)

      throw error
    }
  } catch (error: any) {
    console.error('Intune sync error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync Intune data' },
      { status: 500 }
    )
  }
}

function mapIntuneDeviceType(device: IntuneManagedDevice): string | null {
  const os = (device.operatingSystem || '').toLowerCase()
  const model = (device.model || '').toLowerCase()

  if (os.includes('ios') || os.includes('iphone')) return 'Mobile'
  if (os.includes('android')) return 'Mobile'
  if (os.includes('ipad')) return 'Tablet'
  if (os.includes('mac')) return 'LAPTOP'

  if (model.includes('laptop') || model.includes('notebook') || model.includes('surface')) {
    return 'LAPTOP'
  }
  if (model.includes('desktop') || model.includes('tower') || model.includes('optiplex')) {
    return 'DESKTOP'
  }

  if (os.includes('windows')) return 'WINDOWS_PC'

  return null
}

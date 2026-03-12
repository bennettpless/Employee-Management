import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readExcelSheet } from '@/lib/sharepoint-excel'
import { mapExcelRowToEmployee } from '@/lib/excel-mapper'

// Configure route for long-running operations
export const maxDuration = 600 // 10 minutes
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret (only for automated cron jobs)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.SYNC_CRON_SECRET
    
    // If auth header is provided, verify it matches
    if (authHeader && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const startTime = Date.now()

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'excel',
        status: 'success',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    let recordsSynced = 0
    let recordsFailed = 0
    let totalDevicesProcessed = 0
    let totalDevicesInserted = 0
    let totalDevicesUpdated = 0
    let totalDevicesDeleted = 0
    const errors: string[] = []
    
    // Track all device names from Excel (for cleanup)
    const allExcelDeviceNames = new Set<string>()

    try {
      // Read all rows from Excel
      console.log('Reading Excel sheet...')
      const excelRows = await readExcelSheet()
      console.log(`Found ${excelRows.length} rows in Excel`)

      if (excelRows.length === 0) {
        throw new Error('No data found in Excel sheet')
      }

      // Process each row
      for (let i = 0; i < excelRows.length; i++) {
        const row = excelRows[i]
        
        try {
          // Map Excel row to employee data
          const employeeData = mapExcelRowToEmployee(row)
          
          // Log device extraction for debugging
          if (employeeData.devices && employeeData.devices.length > 0) {
            console.log(`Row ${i + 1}: Extracted ${employeeData.devices.length} device(s): ${employeeData.devices.map(d => d.device_name).join(', ')}`)
          }
          
          if (!employeeData.email) {
            console.warn(`Row ${i + 1}: Skipping row without email`)
            recordsFailed++
            continue
          }

          // Check if employee already exists
          const { data: existingEmployee } = await supabase
            .from('employees')
            .select('id')
            .eq('email', employeeData.email)
            .single()

          const employeeRecord: any = {
            ...employeeData,
            last_synced_at: new Date().toISOString()
          }

          // Remove nested data that will be stored separately
          const { softwareLicenses, devices, ...employeeFields } = employeeRecord

          let employeeId: string

          if (existingEmployee) {
            // Update existing employee
            const { data: updated, error: updateError } = await supabase
              .from('employees')
              .update(employeeFields)
              .eq('id', existingEmployee.id)
              .select('id')
              .single()

            if (updateError) {
              throw updateError
            }

            employeeId = updated.id
          } else {
            // Insert new employee
            const { data: inserted, error: insertError } = await supabase
              .from('employees')
              .insert(employeeFields)
              .select('id')
              .single()

            if (insertError) {
              throw insertError
            }

            employeeId = inserted.id
          }

          // Sync software licenses
          if (softwareLicenses && softwareLicenses.length > 0) {
            // Delete existing licenses for this employee
            await supabase
              .from('employee_software_licenses')
              .delete()
              .eq('employee_id', employeeId)

            // Insert new licenses
            const licenseRecords = softwareLicenses.map(license => ({
              employee_id: employeeId,
              software_name: license.software_name,
              has_license: license.has_license,
              last_synced_at: new Date().toISOString()
            }))

            await supabase
              .from('employee_software_licenses')
              .insert(licenseRecords)
          }

          // Sync devices
          // First, collect all device names from Excel for this employee
          const excelDeviceNames = devices.map(d => {
            const name = d.device_name?.toLowerCase().trim()
            if (name) {
              allExcelDeviceNames.add(name)
            }
            return name
          }).filter(Boolean)
          
          if (devices && devices.length > 0) {
            console.log(`Row ${i + 1} (${employeeData.email}): Processing ${devices.length} device(s)`)
            totalDevicesProcessed += devices.length
            for (const deviceInfo of devices) {
              try {
                if (!deviceInfo.device_name || deviceInfo.device_name.trim().length === 0) {
                  console.warn(`Row ${i + 1}: Skipping empty device name`)
                  continue
                }

                // First try to match by exact device name
                const { data: existingDevicesByName, error: lookupErrorByName } = await supabase
                  .from('devices')
                  .select('id, device_name, employee_id, device_type, serial_number')
                  .eq('device_name', deviceInfo.device_name)

                if (lookupErrorByName) {
                  console.error(`Row ${i + 1}: Error looking up device by name "${deviceInfo.device_name}":`, lookupErrorByName)
                }

                let existingDevice = existingDevicesByName && existingDevicesByName.length > 0 ? existingDevicesByName[0] : null
                let oldDeviceToDelete = null

                // If not found by exact name, this might be a name correction
                // Check if this employee has any devices that don't match any Excel device names
                // Those are likely the old/incorrect names that need to be updated
                if (!existingDevice && employeeId) {
                  const { data: allEmployeeDevices, error: lookupErrorByEmployee } = await supabase
                    .from('devices')
                    .select('id, device_name, employee_id, device_type, serial_number')
                    .eq('employee_id', employeeId)
                  
                  if (lookupErrorByEmployee) {
                    console.error(`Row ${i + 1}: Error looking up devices by employee:`, lookupErrorByEmployee)
                  }
                  
                  if (allEmployeeDevices && allEmployeeDevices.length > 0) {
                    // Find devices that don't match any Excel device names (likely old names)
                    const devicesNotInExcel = allEmployeeDevices.filter(d => {
                      const dbDeviceName = (d.device_name || '').toLowerCase().trim()
                      return !excelDeviceNames.includes(dbDeviceName)
                    })
                    
                    // Check if a device with the new name already exists (duplicate scenario)
                    const deviceWithNewName = allEmployeeDevices.find(d => 
                      (d.device_name || '').toLowerCase().trim() === deviceInfo.device_name.toLowerCase().trim()
                    )
                    
                    if (deviceWithNewName) {
                      // Device with new name already exists - use it and mark old device for deletion
                      existingDevice = deviceWithNewName
                      if (devicesNotInExcel.length === 1) {
                        oldDeviceToDelete = devicesNotInExcel[0]
                        console.log(`Row ${i + 1}: Device "${deviceInfo.device_name}" already exists. Will delete old device "${devicesNotInExcel[0].device_name}"`)
                      }
                    } else if (devicesNotInExcel.length === 1) {
                      // No device with new name exists, update the old one
                      existingDevice = devicesNotInExcel[0]
                      console.log(`Row ${i + 1}: Found device with corrected name: "${devicesNotInExcel[0].device_name}" -> "${deviceInfo.device_name}"`)
                    } else if (devicesNotInExcel.length > 1) {
                      // Multiple devices not in Excel - prefer the one without serial number (Excel-created)
                      const deviceWithoutSerial = devicesNotInExcel.find(d => !d.serial_number)
                      if (deviceWithoutSerial) {
                        existingDevice = deviceWithoutSerial
                        console.log(`Row ${i + 1}: Found Excel device with corrected name: "${deviceWithoutSerial.device_name}" -> "${deviceInfo.device_name}"`)
                      }
                    }
                  }
                }

                const deviceRecord: any = {
                  device_name: deviceInfo.device_name.trim(),
                  device_type: deviceInfo.device_type,
                  employee_id: employeeId,
                  status: 'active',
                  last_synced_at: new Date().toISOString()
                }

                if (existingDevice) {
                  // Delete old device if it exists (duplicate scenario)
                  if (oldDeviceToDelete) {
                    const { error: deleteError } = await supabase
                      .from('devices')
                      .delete()
                      .eq('id', oldDeviceToDelete.id)
                    
                    if (deleteError) {
                      console.error(`Row ${i + 1}: Error deleting old device "${oldDeviceToDelete.device_name}":`, deleteError)
                    } else {
                      console.log(`Row ${i + 1}: Deleted old device "${oldDeviceToDelete.device_name}" (duplicate of "${deviceInfo.device_name}")`)
                    }
                  }
                  
                  // Update existing device with new name (handles name corrections)
                  // Only update if the name actually changed
                  if (existingDevice.device_name !== deviceInfo.device_name) {
                    const { error: updateError } = await supabase
                      .from('devices')
                      .update({
                        ...deviceRecord,
                        employee_id: employeeId
                      })
                      .eq('id', existingDevice.id)

                    if (updateError) {
                      console.error(`Row ${i + 1}: Error updating device "${deviceInfo.device_name}":`, updateError)
                    } else {
                      console.log(`Row ${i + 1}: Updated device name "${existingDevice.device_name}" -> "${deviceInfo.device_name}"`)
                      totalDevicesUpdated++
                    }
                  } else {
                    // Name is the same, just update other fields
                    const { error: updateError } = await supabase
                      .from('devices')
                      .update({
                        device_type: deviceInfo.device_type,
                        employee_id: employeeId,
                        status: 'active',
                        last_synced_at: new Date().toISOString()
                      })
                      .eq('id', existingDevice.id)

                    if (updateError) {
                      console.error(`Row ${i + 1}: Error updating device "${deviceInfo.device_name}":`, updateError)
                    } else {
                      console.log(`Row ${i + 1}: Updated existing device "${deviceInfo.device_name}"`)
                      totalDevicesUpdated++
                    }
                  }
                } else {
                  // Insert new device
                  // Generate a unique ninja_device_id for Excel-sourced devices (will be updated by Ninja sync)
                  deviceRecord.ninja_device_id = `excel-${deviceInfo.device_name}-${Date.now()}`
                  
                  const { data: insertedDevice, error: insertError } = await supabase
                    .from('devices')
                    .insert(deviceRecord)
                    .select('id')
                    .single()

                  if (insertError) {
                    console.error(`Row ${i + 1}: Error inserting device "${deviceInfo.device_name}":`, insertError)
                  } else {
                    console.log(`Row ${i + 1}: Inserted new device "${deviceInfo.device_name}" (ID: ${insertedDevice.id})`)
                    totalDevicesInserted++
                  }
                }
              } catch (deviceError: any) {
                console.error(`Row ${i + 1}: Error processing device "${deviceInfo.device_name}":`, deviceError)
              }
            }
          } else {
            console.log(`Row ${i + 1} (${employeeData.email}): No devices found`)
          }

          recordsSynced++
        } catch (error: any) {
          console.error(`Error processing row ${i + 1}:`, error)
          errors.push(`Row ${i + 1}: ${error.message}`)
          recordsFailed++
        }
      }

      // Cleanup: Delete devices that no longer exist in Excel
      console.log('\n🔍 Cleaning up devices that no longer exist in Excel...')
      console.log(`  Total Excel device names collected: ${allExcelDeviceNames.size}`)
      if (allExcelDeviceNames.size > 0) {
        console.log(`  Sample Excel device names: ${Array.from(allExcelDeviceNames).slice(0, 10).join(', ')}`)
      }
      
      // Check ALL devices with employee_id (Excel-sourced devices)
      // Also check devices with ninja_device_id starting with "excel-" (even if no employee_id)
      // All of these should exist in Excel
      const { data: allExcelSourcedDevices, error: fetchError } = await supabase
        .from('devices')
        .select('id, device_name, employee_id, ninja_device_id')
        .or('employee_id.not.is.null,ninja_device_id.like.excel-%')
      
      if (fetchError) {
        console.error('  ❌ Error fetching Excel-sourced devices:', fetchError)
        errors.push(`Failed to fetch devices for cleanup: ${fetchError.message}`)
      } else if (allExcelSourcedDevices) {
        console.log(`  Found ${allExcelSourcedDevices.length} Excel-sourced device(s) in database`)
        
        const devicesToDelete = allExcelSourcedDevices.filter(device => {
          const deviceName = (device.device_name || '').toLowerCase().trim()
          if (!deviceName) {
            return false // Skip devices with no name
          }
          
          const existsInExcel = allExcelDeviceNames.has(deviceName)
          
          // Debug logging for devices not found in Excel
          if (!existsInExcel) {
            console.log(`  🔍 Device "${device.device_name}" (normalized: "${deviceName}") not found in Excel`)
            console.log(`     - employee_id: ${device.employee_id || 'null'}`)
            console.log(`     - ninja_device_id: ${device.ninja_device_id || 'null'}`)
            // Check if a similar name exists (for debugging)
            const similarNames = Array.from(allExcelDeviceNames).filter(excelName => 
              excelName.includes(deviceName.substring(0, Math.min(10, deviceName.length))) ||
              deviceName.includes(excelName.substring(0, Math.min(10, excelName.length)))
            )
            if (similarNames.length > 0) {
              console.log(`     - Similar Excel names found: ${similarNames.slice(0, 3).join(', ')}`)
            }
          }
          
          return !existsInExcel
        })
        
        if (devicesToDelete.length > 0) {
          console.log(`  Found ${devicesToDelete.length} device(s) to delete (no longer in Excel):`)
          for (const device of devicesToDelete) {
            console.log(`    - ${device.device_name} (ID: ${device.id}, employee_id: ${device.employee_id})`)
            const { error: deleteError } = await supabase
              .from('devices')
              .delete()
              .eq('id', device.id)
            
            if (deleteError) {
              console.error(`    ❌ Error deleting device "${device.device_name}":`, deleteError)
              errors.push(`Failed to delete device ${device.device_name}: ${deleteError.message}`)
            } else {
              totalDevicesDeleted++
              console.log(`    ✅ Deleted device "${device.device_name}"`)
            }
          }
        } else {
          console.log('  ✅ No devices to delete - all devices exist in Excel')
          // Debug: Show a few sample devices to verify they're being checked
          if (allExcelSourcedDevices.length > 0) {
            console.log(`  Sample database devices checked: ${allExcelSourcedDevices.slice(0, 5).map(d => d.device_name).join(', ')}`)
          }
        }
      } else {
        console.log('  ⚠️ No Excel-sourced devices found in database')
      }
      
      // Also check for devices WITHOUT employee_id that might be orphaned Excel devices
      // (devices with "excel-" prefix in ninja_device_id but no employee_id)
      console.log('\n🔍 Checking for orphaned Excel devices (no employee_id)...')
      const { data: orphanedDevices, error: orphanedError } = await supabase
        .from('devices')
        .select('id, device_name, employee_id, ninja_device_id')
        .is('employee_id', null)
        .like('ninja_device_id', 'excel-%')
      
      if (orphanedError) {
        console.error('  ❌ Error fetching orphaned devices:', orphanedError)
      } else if (orphanedDevices && orphanedDevices.length > 0) {
        console.log(`  Found ${orphanedDevices.length} orphaned Excel device(s) (no employee_id)`)
        const orphanedToDelete = orphanedDevices.filter(device => {
          const deviceName = (device.device_name || '').toLowerCase().trim()
          return deviceName && !allExcelDeviceNames.has(deviceName)
        })
        
        if (orphanedToDelete.length > 0) {
          console.log(`  Deleting ${orphanedToDelete.length} orphaned device(s):`)
          for (const device of orphanedToDelete) {
            console.log(`    - ${device.device_name} (ID: ${device.id})`)
            const { error: deleteError } = await supabase
              .from('devices')
              .delete()
              .eq('id', device.id)
            
            if (deleteError) {
              console.error(`    ❌ Error deleting orphaned device "${device.device_name}":`, deleteError)
            } else {
              totalDevicesDeleted++
              console.log(`    ✅ Deleted orphaned device "${device.device_name}"`)
            }
          }
        }
      }

      // Update sync log
      const duration = Math.floor((Date.now() - startTime) / 1000)
      console.log(`\n=== Excel Sync Summary ===`)
      console.log(`Records synced: ${recordsSynced}`)
      console.log(`Records failed: ${recordsFailed}`)
      console.log(`Total devices processed: ${totalDevicesProcessed}`)
      console.log(`Devices inserted: ${totalDevicesInserted}`)
      console.log(`Devices updated: ${totalDevicesUpdated}`)
      console.log(`Devices deleted: ${totalDevicesDeleted}`)
      console.log(`Duration: ${duration}s`)
      console.log(`========================\n`)
      
      await supabase
        .from('sync_logs')
        .update({
          status: recordsFailed > 0 ? 'partial' : 'success',
          records_synced: recordsSynced,
          records_failed: recordsFailed,
          error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
          completed_at: new Date().toISOString(),
          duration_seconds: duration
        })
        .eq('id', syncLog.id)

      // After successful Excel sync, trigger Ninja sync to populate device details
      // Only sync devices that were found in Excel
      if (recordsSynced > 0) {
        console.log('Excel sync completed, triggering Ninja sync for Excel devices...')
        try {
          // Get all device names from devices that have employee_id set (from Excel)
          const { data: excelDevices } = await supabase
            .from('devices')
            .select('device_name')
            .not('device_name', 'is', null)
            .not('employee_id', 'is', null)
          
          const deviceNames = excelDevices?.map(d => d.device_name).filter(Boolean) || []
          
          if (deviceNames.length > 0) {
            console.log(`Triggering Ninja sync for ${deviceNames.length} Excel devices...`)
            // Trigger Ninja sync in the background (don't wait for it)
            // Determine the app URL - prefer VERCEL_URL, then NEXT_PUBLIC_APP_URL, then localhost
            let appUrl = 'http://localhost:3000' // Default for local development
            if (process.env.VERCEL_URL) {
              appUrl = `https://${process.env.VERCEL_URL}`
            } else if (process.env.NEXT_PUBLIC_APP_URL) {
              appUrl = process.env.NEXT_PUBLIC_APP_URL
            }
            
            console.log(`Calling Ninja sync endpoint: ${appUrl}/api/sync/ninjaone`)
            
            fetch(`${appUrl}/api/sync/ninjaone`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                excelOnly: true,
                excelDeviceNames: deviceNames
              })
            })
            .then(response => {
              console.log(`Ninja sync response status: ${response.status}`)
              if (!response.ok) {
                return response.text().then(text => {
                  console.error(`Ninja sync failed: ${response.status} - ${text}`)
                })
              }
              console.log('Ninja sync started successfully')
            })
            .catch(err => {
              console.error('Failed to trigger Ninja sync:', err.message || err)
              // Don't fail the Excel sync if Ninja sync trigger fails
            })
          } else {
            console.log('No device names found, skipping Ninja sync')
          }
        } catch (err) {
          console.error('Error triggering Ninja sync:', err)
        }
      }

      return NextResponse.json({
        success: true,
        recordsSynced,
        recordsFailed,
        errors: errors.slice(0, 10), // Return first 10 errors
        duration
      })
    } catch (error: any) {
      console.error('Excel sync error:', error)
      
      // Update sync log with error
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
        .eq('id', syncLog.id)

      return NextResponse.json(
        { error: error.message, recordsSynced, recordsFailed },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Excel sync route error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync Excel data' },
      { status: 500 }
    )
  }
}


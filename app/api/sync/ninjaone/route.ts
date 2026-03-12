import { NextRequest, NextResponse } from 'next/server'
import { ninjaOne } from '@/lib/ninjaone'
import { getServiceSupabase } from '@/lib/supabase'
import { getAllUsersWithDevices } from '@/lib/azure-graph'

// Configure route for long-running operations
export const maxDuration = 600 // 10 minutes (allow enough time for full sync)
export const runtime = 'nodejs' // Use Node.js runtime (not Edge)

export async function POST(request: NextRequest) {
  console.log('=== NinjaOne Sync Started ===')
  try {
    // Verify cron secret (only for automated cron jobs)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.SYNC_CRON_SECRET
    
    // If auth header is provided, verify it matches
    if (authHeader && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if this is an Excel-only sync
    let excelOnly = false
    let excelDeviceNames: Set<string> | null = null
    try {
      const body = await request.json().catch(() => ({}))
      excelOnly = body.excelOnly === true
      if (excelOnly && body.excelDeviceNames && Array.isArray(body.excelDeviceNames)) {
        excelDeviceNames = new Set(body.excelDeviceNames.map((name: string) => name.toLowerCase().trim()))
        // Also add normalized versions (without special chars) for better matching
        body.excelDeviceNames.forEach((name: string) => {
          const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
          if (normalized) {
            excelDeviceNames!.add(normalized)
          }
        })
        console.log(`Ninja sync: Excel-only mode, ${excelDeviceNames.size} device names from Excel`)
      } else {
        console.log('Ninja sync: Full sync mode (not Excel-only)')
      }
    } catch (e) {
      // Body parsing failed, continue with normal sync
      console.log('Ninja sync: Body parsing failed, continuing with normal sync')
    }

    const supabase = getServiceSupabase()
    const startTime = Date.now()

    // Clean up duplicate devices before starting sync
    console.log('🔍 Checking for duplicate devices...')
    const { data: allDevices } = await supabase
      .from('devices')
      .select('id, device_name, employee_id, ninja_device_id, serial_number, manufacturer, model, os_name, is_in_ninja, azure_device_id')
      .not('employee_id', 'is', null)
    
    if (allDevices) {
      // Group devices by name and employee_id to find duplicates
      const deviceGroups = new Map<string, any[]>()
      
      for (const device of allDevices) {
        const key = `${(device.device_name || '').toLowerCase().trim()}_${device.employee_id}`
        if (!deviceGroups.has(key)) {
          deviceGroups.set(key, [])
        }
        deviceGroups.get(key)!.push(device)
      }
      
      // Find and merge duplicates
      let duplicatesMerged = 0
      for (const [key, devices] of deviceGroups.entries()) {
        if (devices.length > 1) {
          console.log(`  ⚠️ Found ${devices.length} duplicate devices for "${devices[0].device_name}" (employee_id: ${devices[0].employee_id})`)
          
          // Score each device to determine which one to keep
          // Higher score = more complete data = keep this one
          const scoredDevices = devices.map(device => {
            let score = 0
            // Prefer devices with real NinjaOne ID (not "excel-")
            if (device.ninja_device_id && !device.ninja_device_id.startsWith('excel-')) {
              score += 100
            }
            // Prefer devices with NinjaOne data
            if (device.is_in_ninja) {
              score += 50
            }
            // Prefer devices with serial number
            if (device.serial_number) {
              score += 30
            }
            // Prefer devices with manufacturer
            if (device.manufacturer) {
              score += 20
            }
            // Prefer devices with model
            if (device.model) {
              score += 20
            }
            // Prefer devices with OS info
            if (device.os_name) {
              score += 20
            }
            // Prefer devices with Azure ID
            if (device.azure_device_id) {
              score += 10
            }
            return { device, score }
          })
          
          // Sort by score (highest first)
          scoredDevices.sort((a, b) => b.score - a.score)
          const deviceToKeep = scoredDevices[0].device
          const devicesToDelete = scoredDevices.slice(1).map(d => d.device)
          
          console.log(`  ✅ Keeping device ID ${deviceToKeep.id} (score: ${scoredDevices[0].score})`)
          console.log(`  🗑️  Deleting ${devicesToDelete.length} duplicate(s)`)
          
          // Delete duplicates
          for (const duplicate of devicesToDelete) {
            const { error: deleteError } = await supabase
              .from('devices')
              .delete()
              .eq('id', duplicate.id)
            
            if (deleteError) {
              console.error(`  ❌ Error deleting duplicate device ${duplicate.id}:`, deleteError)
            } else {
              duplicatesMerged++
              console.log(`  ✅ Deleted duplicate device ID ${duplicate.id}`)
            }
          }
        }
      }
      
      if (duplicatesMerged > 0) {
        console.log(`✅ Cleaned up ${duplicatesMerged} duplicate device(s)`)
      } else {
        console.log('✅ No duplicates found')
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
        // Only fetch Azure device mappings in full sync mode (not Excel-only mode)
        // In Excel-only mode, employee assignments come from Excel, not Azure
        let deviceNameToEmployeeMap = new Map<string, string>()
        
        if (!excelOnly) {
          // First, get Azure device mapping (user ID -> device names)
          console.log('Fetching Azure device mappings...')
          const azureUserDeviceMap = await getAllUsersWithDevices()
          
          // Get all employees to map Azure user IDs to our employee IDs
          const { data: employees } = await supabase
            .from('employees')
            .select('id, entra_id')
          
          const entraIdToEmployeeMap = new Map<string, string>()
          employees?.forEach((emp: any) => {
            if (emp.entra_id) {
              entraIdToEmployeeMap.set(emp.entra_id, emp.id)
            }
          })
          
          // Build device name to employee ID mapping from Azure data
          for (const [azureUserId, devices] of azureUserDeviceMap.entries()) {
            const employeeId = entraIdToEmployeeMap.get(azureUserId)
            if (employeeId) {
              devices.forEach((device) => {
                // Normalize device name for matching (lowercase, remove special chars)
                const normalizedName = (device.displayName || '').toLowerCase().trim()
                if (normalizedName) {
                  // Store multiple variations for better matching
                  deviceNameToEmployeeMap.set(normalizedName, employeeId)
                  // Also try without hyphens/spaces
                  const noSpecialChars = normalizedName.replace(/[^a-z0-9]/g, '')
                  if (noSpecialChars && noSpecialChars !== normalizedName) {
                    deviceNameToEmployeeMap.set(noSpecialChars, employeeId)
                  }
                }
              })
            }
          }
          
          console.log(`Created device name mapping for ${deviceNameToEmployeeMap.size} device names from ${azureUserDeviceMap.size} Azure users`)
        } else {
          console.log('Excel-only mode: Skipping Azure device mappings (using Excel employee assignments)')
        }
        
        // Fetch all devices from NinjaOne
        const ninjaDevices = await ninjaOne.getDevices()
        
        console.log(`Fetched ${ninjaDevices.length} devices from NinjaOne`)
        
        // If Excel-only mode, process all devices and match by name OR serial number during processing
        // Devices with truncated names will be matched by serial number
        let devicesToProcess = ninjaDevices
        if (excelOnly && excelDeviceNames && excelDeviceNames.size > 0) {
          // Process all devices - matching (by name or serial) happens during processing
          // This ensures devices with truncated names can still be matched by serial number
          console.log(`Excel-only mode: Processing all ${devicesToProcess.length} devices (will match by name or serial number)`)
        }

        // Process devices in parallel batches to speed up sync
        const BATCH_SIZE = 10 // Process 10 devices at a time
        const batches = []
        
        for (let i = 0; i < devicesToProcess.length; i += BATCH_SIZE) {
          batches.push(devicesToProcess.slice(i, i + BATCH_SIZE))
        }

        console.log(`Processing ${devicesToProcess.length} devices in ${batches.length} batches of ${BATCH_SIZE}`)

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex]
          console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} devices)`)

          // Process batch in parallel
          const results = await Promise.all(batch.map(async (device: any) => {
            try {
              // Fetch detailed device information
              const deviceDetails = await ninjaOne.getDevice(device.id.toString())
              
              // IMPORTANT: NinjaOne sync should NEVER assign devices to employees
              // Azure is the source of truth for device assignments
              // NinjaOne only enriches device data and matches to existing Azure devices

              // Check if device already exists
              // IMPORTANT: Use dnsName first (full name) if available, as it's not truncated
              // systemName is often truncated (15 chars), but dnsName has the full serial number
              let existingDevice = null
              const deviceName = (device.dnsName || device.systemName || '').trim()
              const deviceNameLower = deviceName.toLowerCase()
              
              // Get NinjaOne serial number for matching
              const ninjaSerialNumber = (deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || '').trim().toUpperCase()
              
              console.log(`\n  🔍 Processing NinjaOne device: "${deviceName}" (serial: ${ninjaSerialNumber || 'N/A'})`)
              
              // First try by ninja_device_id
              const { data: byNinjaId } = await supabase
                .from('devices')
                .select('id, azure_device_id, employee_id, device_name, ninja_device_id, serial_number')
                .eq('ninja_device_id', device.id.toString())
                .maybeSingle()
              
              existingDevice = byNinjaId
              
              // Also check for Excel-created devices (those with ninja_device_id starting with "excel-")
              // These should be matched by name/serial and updated with the real NinjaOne ID
              if (!existingDevice && excelOnly && deviceName) {
                const { data: excelDevices } = await supabase
                  .from('devices')
                  .select('id, azure_device_id, employee_id, device_name, ninja_device_id, serial_number')
                  .like('ninja_device_id', 'excel-%')
                  .not('employee_id', 'is', null)
                
                if (excelDevices) {
                  for (const excelDevice of excelDevices) {
                    const excelDeviceName = (excelDevice.device_name || '').trim().toLowerCase()
                    if (excelDeviceName === deviceNameLower) {
                      existingDevice = excelDevice
                      console.log(`  ✅ Matched NinjaOne device "${deviceName}" to Excel-created device "${excelDevice.device_name}" (will update ninja_device_id)`)
                      break
                    }
                  }
                }
              }
              
              // In Excel-only mode, only match to Excel devices (those with employee_id)
              // In full sync mode, match to any device including Azure devices
              if (!existingDevice && deviceName) {
                if (excelOnly) {
                  // Excel-only mode: Match by device name to devices that have employee_id (from Excel)
                  // Try exact match first (case-sensitive)
                  const { data: byNameExact } = await supabase
                    .from('devices')
                    .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                    .eq('device_name', deviceName)
                    .not('employee_id', 'is', null)
                    .maybeSingle()
                  
                  if (byNameExact) {
                    existingDevice = byNameExact
                    console.log(`  ✅ Matched NinjaOne device "${deviceName}" to Excel device "${byNameExact.device_name}" (exact match)`)
                  } else {
                    // Try case-insensitive match
                    const { data: allExcelDevices } = await supabase
                      .from('devices')
                      .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                      .not('employee_id', 'is', null)
                    
                    if (allExcelDevices) {
                      for (const candidateDevice of allExcelDevices) {
                        const candidateName = (candidateDevice.device_name || '').toLowerCase().trim()
                        if (!candidateName) continue
                        
                        // Case-insensitive exact match
                        if (candidateName === deviceNameLower) {
                          existingDevice = candidateDevice
                          console.log(`  ✅ Matched NinjaOne device "${deviceName}" to Excel device "${candidateDevice.device_name}" (case-insensitive)`)
                          break
                        }
                      }
                    }
                  }
                  
                  // If still not found, try serial number matching (step 2) and partial name matching (step 3)
                  if (!existingDevice) {
                      const { data: allExcelDevices } = await supabase
                        .from('devices')
                        .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                        .not('employee_id', 'is', null)
                      
                      if (allExcelDevices) {
                        console.log(`  🔍 Checking ${allExcelDevices.length} Excel devices for serial number and partial name matching...`)
                        
                        for (const candidateDevice of allExcelDevices) {
                          const candidateName = (candidateDevice.device_name || '').trim()
                          if (!candidateName) continue
                          
                          // Step 2: Match serial numbers (>=10 chars)
                          // Compare NinjaOne serial number to Excel device name without city prefix
                          if (ninjaSerialNumber && ninjaSerialNumber.length >= 10) {
                            // Extract serial number part from Excel device name (everything after first hyphen)
                            const candidateNameParts = candidateName.split('-')
                            const candidateSerialPart = candidateNameParts.length >= 2 ? candidateNameParts.slice(1).join('-') : candidateName
                            const excelSerial = candidateSerialPart.toUpperCase().trim()
                            
                            // Compare serial numbers (case-insensitive) - exact match
                            if (excelSerial === ninjaSerialNumber) {
                              existingDevice = candidateDevice
                              console.log(`  ✅ Matched NinjaOne device "${deviceName}" (serial: ${ninjaSerialNumber}) to Excel device "${candidateDevice.device_name}" (serial: ${excelSerial}) by serial number`)
                              break
                            }
                            
                            // Try partial serial matching (if one is longer than the other)
                            if (!existingDevice) {
                              // If NinjaOne serial is longer, check if Excel serial matches the prefix
                              if (ninjaSerialNumber.length > excelSerial.length) {
                                const ninjaSerialPrefix = ninjaSerialNumber.substring(0, excelSerial.length)
                                if (ninjaSerialPrefix === excelSerial) {
                                  existingDevice = candidateDevice
                                  console.log(`  ✅ Matched NinjaOne device "${deviceName}" (serial: ${ninjaSerialNumber}) to Excel device "${candidateDevice.device_name}" (serial: ${excelSerial}) by serial prefix`)
                                  break
                                }
                              }
                              // If Excel serial is longer, check if NinjaOne serial matches the prefix
                              if (excelSerial.length > ninjaSerialNumber.length) {
                                const excelSerialPrefix = excelSerial.substring(0, ninjaSerialNumber.length)
                                if (excelSerialPrefix === ninjaSerialNumber) {
                                  existingDevice = candidateDevice
                                  console.log(`  ✅ Matched NinjaOne device "${deviceName}" (serial: ${ninjaSerialNumber}) to Excel device "${candidateDevice.device_name}" (serial: ${excelSerial}) by serial prefix`)
                                  break
                                }
                              }
                            }
                          }
                           
                          // Step 3: Match partial name (>=12 chars)
                          // Compare full NinjaOne device name to full Excel device name minus last 2 chars
                          if (!existingDevice && deviceName.length >= 12 && candidateName.length >= 12) {
                            const excelNameMinusLast2 = candidateName.slice(0, -2) // Remove last 2 characters
                            
                            // Compare full NinjaOne name to Excel name minus last 2 chars
                            if (deviceName === excelNameMinusLast2 || deviceNameLower === excelNameMinusLast2.toLowerCase()) {
                              existingDevice = candidateDevice
                              console.log(`  ✅ Matched NinjaOne device "${deviceName}" to Excel device "${candidateDevice.device_name}" (removed last 2 chars: "${excelNameMinusLast2}") by partial name`)
                              break
                            }
                          }
                        }
                        
                        if (!existingDevice) {
                          console.log(`  ❌ No match found for "${deviceName}" via serial number or partial name matching`)
                        }
                      }
                    }
                } else {
                  // Full sync mode: Match to any device (including Azure devices)
                  // Try exact match first
                  const { data: byNameExact } = await supabase
                    .from('devices')
                    .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                    .eq('device_name', deviceName)
                    .maybeSingle()
                  
                  if (byNameExact) {
                    existingDevice = byNameExact
                  } else {
                    // Try case-insensitive match
                    const { data: byNameCaseInsensitive } = await supabase
                      .from('devices')
                      .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                      .ilike('device_name', deviceName)
                      .maybeSingle()
                    
                    if (byNameCaseInsensitive) {
                      existingDevice = byNameCaseInsensitive
                    } else {
                      // Try fuzzy match - get all devices and match by name similarity
                      const { data: allDevices } = await supabase
                        .from('devices')
                        .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                      
                      if (allDevices) {
                        for (const candidateDevice of allDevices) {
                          const candidateName = (candidateDevice.device_name || '').toLowerCase().trim()
                          if (!candidateName) continue
                          
                          // Check if names match (exact or normalized)
                          const normalizedDeviceName = deviceNameLower.replace(/[^a-z0-9]/g, '')
                          const normalizedCandidateName = candidateName.replace(/[^a-z0-9]/g, '')
                          
                          if (normalizedDeviceName === normalizedCandidateName ||
                              deviceNameLower.includes(candidateName) ||
                              candidateName.includes(deviceNameLower)) {
                            existingDevice = candidateDevice
                            break
                          }
                        }
                      }
                    }
                  }
                  
                  // If not found by name, check for Azure device by serial number (only in full sync mode)
                  if (!existingDevice) {
                    const ninjaSerialNumber = (deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || '').trim()
                    
                    if (ninjaSerialNumber) {
                      const normalizedNinjaSerial = ninjaSerialNumber.toUpperCase().trim()
                      
                      const { data: potentialMatches, error: serialError } = await supabase
                        .from('devices')
                        .select('id, azure_device_id, employee_id, device_name, ninja_device_id, serial_number')
                        .not('azure_device_id', 'is', null)
                        .is('ninja_device_id', null)
                        .ilike('serial_number', normalizedNinjaSerial)
                        
                      if (serialError && serialError.code !== 'PGRST116') {
                        console.error(`  Error checking by serial_number field:`, serialError)
                      } else if (potentialMatches && potentialMatches.length > 0) {
                        existingDevice = potentialMatches[0]
                        console.log(`  📌 ✅ FOUND UNMATCHED AZURE DEVICE by serial_number field: Azure device "${existingDevice.device_name}" (serial: ${existingDevice.serial_number}) matches NinjaOne serial "${ninjaSerialNumber}" - linking devices`)
                      }
                    }
                  }
                }
              }
              
              // If we found a device by name match, optionally verify it with serial number
              // NOTE: We keep the name match even if serial numbers don't match because
              // some devices don't follow the "city-serialnumber" format
              // Serial number matching is used as a fallback when name matching fails
              if (existingDevice && existingDevice.azure_device_id) {
                const ninjaSerialNumber = (deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || '').trim()
                if (ninjaSerialNumber) {
                  const azureDeviceName = (existingDevice.device_name || '').trim()
                  const nameParts = azureDeviceName.split('-')
                  if (nameParts.length >= 2) {
                    const azureSerialPart = nameParts.slice(1).join('-').toLowerCase().trim()
                    const normalizedNinjaSerial = ninjaSerialNumber.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const normalizedAzureSerial = azureSerialPart.replace(/[^a-z0-9]/g, '')
                    
                    // Just log the comparison - don't break the match if serials don't match
                    // (some devices don't follow the city-serialnumber format)
                    if (normalizedNinjaSerial !== normalizedAzureSerial) {
                      console.log(`  ⚠️ Name match found but serial numbers don't match: NinjaOne serial="${ninjaSerialNumber}" (normalized: "${normalizedNinjaSerial}") vs Azure device "${azureDeviceName}" (extracted serial: "${azureSerialPart}" -> normalized: "${normalizedAzureSerial}"). Keeping name match (device may not follow city-serialnumber format).`)
                    } else {
                      console.log(`  ✅ Name match verified by serial number: Serial "${ninjaSerialNumber}" matches Azure device "${azureDeviceName}"`)
                    }
                  }
                }
              }
              
              // Use employee_id from existing device if found (Azure is source of truth)
              const employeeId = existingDevice?.employee_id || null

              // Convert Unix timestamp to ISO string for last_seen
              let lastSeen = null
              if (device.lastContact) {
                // NinjaOne returns Unix timestamp (seconds since epoch)
                const timestamp = parseFloat(device.lastContact)
                lastSeen = new Date(timestamp * 1000).toISOString()
              }

              // Build device data - preserve employee_id from Azure (never set it from NinjaOne)
              // IMPORTANT: Preserve the existing device_name if it exists (Excel is source of truth for device names)
              // Only use NinjaOne name if device doesn't exist yet
              // This ensures Excel device names (which may be truncated) are preserved
              const deviceData: any = {
                ninja_device_id: device.id.toString(),
                // Preserve existing device_name (from Excel) if it exists, otherwise use NinjaOne name
                device_name: existingDevice?.device_name || device.dnsName || device.systemName || 'Unknown Device',
                device_type: device.nodeClass || null,
                manufacturer: deviceDetails.system?.manufacturer || null,
                model: deviceDetails.system?.model || null,
                serial_number: deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || null,
                os_name: deviceDetails.os?.name || null,
                os_version: deviceDetails.os?.version || null,
                last_seen: lastSeen,
                status: 'active',
                is_in_ninja: true, // Mark as in NinjaOne
                last_synced_at: new Date().toISOString()
              }
              
              // CRITICAL: Only set employee_id if it exists on the existing device (from Azure)
              // NinjaOne should NEVER assign devices to employees
              if (existingDevice?.employee_id) {
                deviceData.employee_id = existingDevice.employee_id
              }
              
              // Preserve azure_device_id if device was already synced from Azure
              if (existingDevice?.azure_device_id) {
                deviceData.azure_device_id = existingDevice.azure_device_id
              }

              // If we have an existing device but it doesn't have azure_device_id, try to find matching Azure device by serial number
              // This merges devices that were synced separately (e.g., NinjaOne device exists, Azure device exists separately)
              // Only do this in full sync mode, not Excel-only mode
              if (!excelOnly && existingDevice && !existingDevice.azure_device_id) {
                const ninjaSerialNumber = (deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || '').trim()
                if (ninjaSerialNumber) {
                  console.log(`  🔍 Existing NinjaOne device has no azure_device_id - checking for matching Azure device by serial "${ninjaSerialNumber}"`)
                  
                  const normalizedNinjaSerial = ninjaSerialNumber.toLowerCase().replace(/[^a-z0-9]/g, '')
                  
                  // Search for Azure devices with matching serial number
                  let allAzureDevices: any[] = []
                  let offset = 0
                  const batchSize = 1000
                  let hasMore = true
                  
                  while (hasMore && offset < 10000) {
                    const { data: azureDevicesBatch } = await supabase
                      .from('devices')
                      .select('id, azure_device_id, employee_id, device_name, ninja_device_id')
                      .not('azure_device_id', 'is', null)
                      .or(`and(ninja_device_id.is.null),and(ninja_device_id.eq.${device.id.toString()})`)
                      .range(offset, offset + batchSize - 1)
                      .order('device_name', { ascending: true })
                    
                    if (azureDevicesBatch && azureDevicesBatch.length > 0) {
                      allAzureDevices = allAzureDevices.concat(azureDevicesBatch)
                      offset += batchSize
                      hasMore = azureDevicesBatch.length === batchSize
                    } else {
                      hasMore = false
                    }
                  }
                  
                  console.log(`  🔍 Checking ${allAzureDevices.length} Azure devices for serial number match`)
                  
                  let foundMatch = false
                  for (const azureDevice of allAzureDevices) {
                    if (azureDevice.ninja_device_id && azureDevice.ninja_device_id !== device.id.toString()) {
                      continue
                    }
                    
                    const azureDeviceName = (azureDevice.device_name || '').trim()
                    
                    // Try to extract serial number from Azure device name
                    // Format: "city-serialnumber" -> extract "serialnumber" (part after first hyphen)
                    const nameParts = azureDeviceName.split('-')
                    let azureSerialPart = ''
                    let normalizedAzureSerial = ''
                    
                    if (nameParts.length >= 2) {
                      // Take everything after the first hyphen as the serial number part
                      azureSerialPart = nameParts.slice(1).join('-').toLowerCase().trim()
                      normalizedAzureSerial = azureSerialPart.replace(/[^a-z0-9]/g, '')
                    }
                    
                    // Also check if device name contains the serial number anywhere (in case format differs)
                    const normalizedAzureName = azureDeviceName.toLowerCase().replace(/[^a-z0-9]/g, '')
                    const containsSerial = normalizedAzureName.includes(normalizedNinjaSerial)
                    
                    // Match if:
                    // 1. Serial number extracted from name matches exactly, OR
                    // 2. Serial number appears anywhere in the normalized device name
                    if (normalizedNinjaSerial && (
                      (normalizedAzureSerial && normalizedNinjaSerial === normalizedAzureSerial) ||
                      (normalizedNinjaSerial.length >= 4 && containsSerial) // Only if serial is at least 4 chars to avoid false matches
                    )) {
                      console.log(`  📌 ✅ FOUND AZURE MATCH for existing NinjaOne device: Azure device "${azureDevice.device_name}" (serial extracted: "${azureSerialPart}" -> normalized: "${normalizedAzureSerial}") matches NinjaOne serial "${ninjaSerialNumber}" (normalized: "${normalizedNinjaSerial}") - merging devices`)
                      
                      // Use the Azure device instead (it has azure_device_id and employee_id)
                      // Delete the old NinjaOne-only device and use the Azure one
                      await supabase
                        .from('devices')
                        .delete()
                        .eq('id', existingDevice.id)
                      
                      existingDevice = azureDevice
                      foundMatch = true
                      break
                    }
                  }
                  
                  if (!foundMatch && allAzureDevices.length > 0) {
                    console.log(`  ❌ No Azure device match found for serial "${ninjaSerialNumber}" (normalized: "${normalizedNinjaSerial}") among ${allAzureDevices.length} Azure devices checked`)
                    // Log first few Azure device names for debugging
                    const sampleNames = allAzureDevices.slice(0, 5).map(d => d.device_name).join(', ')
                    console.log(`  🔍 Sample Azure device names checked: ${sampleNames}`)
                  }
                  
                  // Update deviceData with Azure info if we found a match
                  if (existingDevice.azure_device_id) {
                    deviceData.azure_device_id = existingDevice.azure_device_id
                    if (existingDevice.employee_id) {
                      deviceData.employee_id = existingDevice.employee_id
                    }
                  }
                }
              }

              let deviceId: string

              if (existingDevice) {
                // Update existing device - preserve azure_device_id and employee_id if they exist
                const updateData = { ...deviceData }
                
                // Preserve employee_id from existing device (Excel is source of truth for assignments)
                if (existingDevice.employee_id) {
                  updateData.employee_id = existingDevice.employee_id
                }
                
                // Preserve azure_device_id if it exists
                if (existingDevice.azure_device_id) {
                  updateData.azure_device_id = existingDevice.azure_device_id
                }
                
                console.log(`  📝 Updating existing device "${existingDevice.device_name}" (ID: ${existingDevice.id}) with NinjaOne data`)
                
                const { error: updateError } = await supabase
                  .from('devices')
                  .update(updateData)
                  .eq('id', existingDevice.id)
                
                if (updateError) {
                  console.error(`  ❌ Error updating device:`, updateError)
                  throw new Error(`Failed to update device: ${updateError.message}`)
                }
                
                console.log(`  ✅ Successfully updated device "${existingDevice.device_name}" with NinjaOne data`)
                deviceId = existingDevice.id
              } else {
                // Before creating new device, check if there's an Azure device with matching serial number
                // This handles cases where NinjaOne device names are truncated but serial numbers are not
                // Use actual serial number from NinjaOne device details (full serial, not truncated)
                // Compare to serial number extracted from Azure device names (which are full length)
                let serialNumberMatch = false
                
                // Get actual serial number from NinjaOne device details (this is the full serial number)
                const ninjaSerialNumber = (deviceDetails.system?.serialNumber || deviceDetails.system?.biosSerialNumber || '').trim()
                
                if (ninjaSerialNumber) {
                  console.log(`  🔍 Checking for Azure device match by serial number: NinjaOne serial="${ninjaSerialNumber}" from device "${deviceName}"`)
                  
                  // Query Azure devices by serial_number field directly (case-insensitive)
                  // This matches devices with same serial but different prefixes (e.g., "00-HKXRGK2" and "atl-HKXRGK2")
                  // Normalize to uppercase to match how Azure sync stores serial numbers
                  const normalizedNinjaSerial = ninjaSerialNumber.toUpperCase().trim()
                  console.log(`  🔍 Normalized NinjaOne serial: "${normalizedNinjaSerial}"`)
                  
                  const { data: azureDevicesBySerial, error: serialError } = await supabase
                    .from('devices')
                    .select('id, azure_device_id, employee_id, device_name, ninja_device_id, serial_number, last_synced_at')
                    .not('azure_device_id', 'is', null)
                    .or(`and(ninja_device_id.is.null),and(ninja_device_id.eq.${device.id.toString()})`)
                    .ilike('serial_number', normalizedNinjaSerial)
                  
                  if (serialError && serialError.code !== 'PGRST116') {
                    console.error(`  Error checking by serial_number field:`, serialError)
                  } else if (azureDevicesBySerial && azureDevicesBySerial.length > 0) {
                    // Found matching Azure device(s) by serial number
                    // If multiple devices with same serial, use the one with latest last_synced_at (most current)
                    let bestMatch = azureDevicesBySerial[0]
                    if (azureDevicesBySerial.length > 1) {
                      // Sort by last_synced_at (descending) - most recent first
                      azureDevicesBySerial.sort((a: any, b: any) => {
                        const dateA = a.last_synced_at || '1970-01-01'
                        const dateB = b.last_synced_at || '1970-01-01'
                        return dateB.localeCompare(dateA)
                      })
                      bestMatch = azureDevicesBySerial[0]
                      console.log(`  ⚠️ Found ${azureDevicesBySerial.length} Azure devices with same serial number "${normalizedNinjaSerial}" - using most recent (${bestMatch.device_name})`)
                    }
                    
                    // Skip if device is already matched to a different NinjaOne device
                    if (bestMatch.ninja_device_id && bestMatch.ninja_device_id !== device.id.toString()) {
                      console.log(`  ⚠️ Azure device "${bestMatch.device_name}" is already matched to different NinjaOne device - skipping`)
                    } else {
                      existingDevice = bestMatch
                      serialNumberMatch = true
                      console.log(`  📌 ✅ FOUND MATCH by serial_number field: Azure device "${bestMatch.device_name}" (serial: ${bestMatch.serial_number}) matches NinjaOne serial "${ninjaSerialNumber}"`)
                    }
                  } else {
                    console.log(`  ❌ No Azure device match found for serial number "${ninjaSerialNumber}" by serial_number field`)
                  }
                } else {
                  console.log(`  ⚠️ NinjaOne device "${deviceName}" has no serial number in device details - cannot match by serial`)
                }
                
                if (existingDevice && serialNumberMatch) {
                  // Update the matched Azure device instead of creating new one
                  // This prevents "NinjaOne Only" devices when names are truncated
                  const updateData = { ...deviceData }
                  // Preserve azure_device_id and employee_id from Azure device
                  if (existingDevice.azure_device_id) {
                    updateData.azure_device_id = existingDevice.azure_device_id
                  }
                  if (existingDevice.employee_id) {
                    updateData.employee_id = existingDevice.employee_id
                  }
                  
                  const { error: updateError } = await supabase
                    .from('devices')
                    .update(updateData)
                    .eq('id', existingDevice.id)
                  
                  if (updateError) {
                    throw new Error(`Failed to update device: ${updateError.message}`)
                  }
                  
                  deviceId = existingDevice.id
                  console.log(`  ✅ Matched and updated Azure device by serial number: ${existingDevice.device_name}`)
                } else {
                  // Before creating a new device, do a final check for existing devices with same name and employee_id
                  // This prevents duplicates when matching logic fails but device actually exists
                  if (excelOnly && deviceData.employee_id) {
                    const { data: duplicateCheck } = await supabase
                      .from('devices')
                      .select('id, azure_device_id, employee_id, ninja_device_id, device_name, serial_number')
                      .eq('device_name', deviceData.device_name)
                      .eq('employee_id', deviceData.employee_id)
                      .maybeSingle()
                    
                    if (duplicateCheck) {
                      console.log(`  ⚠️ Found existing device with same name and employee_id - updating instead of creating duplicate`)
                      console.log(`  📝 Updating existing device "${duplicateCheck.device_name}" (ID: ${duplicateCheck.id}) with NinjaOne data`)
                      
                      const updateData = { ...deviceData }
                      // Preserve azure_device_id if it exists
                      if (duplicateCheck.azure_device_id) {
                        updateData.azure_device_id = duplicateCheck.azure_device_id
                      }
                      
                      const { error: updateError } = await supabase
                        .from('devices')
                        .update(updateData)
                        .eq('id', duplicateCheck.id)
                      
                      if (updateError) {
                        throw new Error(`Failed to update existing device: ${updateError.message}`)
                      }
                      
                      deviceId = duplicateCheck.id
                      console.log(`  ✅ Successfully updated existing device "${duplicateCheck.device_name}" with NinjaOne data`)
                    } else {
                      // No duplicate found, create new device
                      const { data: newDevice, error: insertError } = await supabase
                        .from('devices')
                        .insert(deviceData)
                        .select('id')
                        .single()
                      
                      if (insertError) {
                        throw new Error(`Failed to insert device: ${insertError.message}`)
                      }
                      
                      if (!newDevice) {
                        throw new Error('Device insert returned null')
                      }
                      
                      deviceId = newDevice.id
                      console.log(`  ✅ Created new device from NinjaOne: ${deviceName} (no match found in Excel)`)
                    }
                  } else {
                    // Not Excel-only mode or no employee_id, create new device
                    const { data: newDevice, error: insertError } = await supabase
                      .from('devices')
                      .insert(deviceData)
                      .select('id')
                      .single()
                    
                    if (insertError) {
                      throw new Error(`Failed to insert device: ${insertError.message}`)
                    }
                    
                    if (!newDevice) {
                      throw new Error('Device insert returned null')
                    }
                    
                    deviceId = newDevice.id
                    if (excelOnly) {
                      console.log(`  ✅ Created new device from NinjaOne: ${deviceName} (no match found in Excel)`)
                    } else {
                      console.log(`  ✅ Created new NinjaOne-only device: ${deviceName}`)
                    }
                  }
                }
              }

              // Sync software for this device (async - don't wait for it to complete)
              ninjaOne.getDeviceSoftware(device.id)
                .then(async (softwareList) => {
                  if (softwareList && softwareList.length > 0) {
                    // Delete existing software links for this device
                    await supabase
                      .from('device_software')
                      .delete()
                      .eq('device_id', deviceId)

                    // Process each software
                    for (const sw of softwareList) {
                      try {
                        const softwareName = sw.name
                        const softwareVersion = sw.version || null
                        const publisher = sw.publisher || null

                        // Check if software already exists
                        let { data: existingSoftware } = await supabase
                          .from('software')
                          .select('id')
                          .eq('name', softwareName)
                          .eq('version', softwareVersion)
                          .eq('publisher', publisher)
                          .single()

                        let softwareId: string

                        if (existingSoftware) {
                          softwareId = existingSoftware.id
                        } else {
                          // Insert new software
                          const { data: newSoftware, error: swInsertError } = await supabase
                            .from('software')
                            .insert({
                              name: softwareName,
                              version: softwareVersion,
                              publisher: publisher
                            })
                            .select('id')
                            .single()

                          if (swInsertError || !newSoftware) {
                            continue
                          }

                          softwareId = newSoftware.id
                        }

                        // Link software to device
                        await supabase
                          .from('device_software')
                          .insert({
                            device_id: deviceId,
                            software_id: softwareId,
                            install_date: sw.installDate || null,
                            last_synced_at: new Date().toISOString()
                          })
                      } catch (swItemError) {
                        // Silent fail for software items
                      }
                    }
                  }
                })
                .catch(() => {
                  // Silent fail for software sync - device is already saved
                })

              return { success: true, deviceId: device.id }
            } catch (error: any) {
              const errorMsg = `Failed to sync device ${device.id}: ${error.message}`
              errors.push(errorMsg)
              return { success: false, deviceId: device.id, error: errorMsg }
            }
          }))

          // Count successes and failures
          const batchSynced = results.filter((r: any) => r.success).length
          const batchFailed = results.filter((r: any) => !r.success).length
          recordsSynced += batchSynced
          recordsFailed += batchFailed
          
          // Log progress
          console.log(`Completed batch ${batchIndex + 1}/${batches.length} - Batch: ${batchSynced} synced, ${batchFailed} failed | Total: ${recordsSynced} synced, ${recordsFailed} failed`)
        }
      
      console.log(`NinjaOne sync complete: ${recordsSynced} synced, ${recordsFailed} failed`)

      // Update sync log
      const duration = Math.floor((Date.now() - startTime) / 1000)
      const completedAt = new Date().toISOString()
      console.log(`Updating sync log ${syncLog!.id} with completed_at: ${completedAt}`)
      
      const { error: updateError } = await supabase
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
      
      if (updateError) {
        console.error('Error updating sync log:', updateError)
      } else {
        console.log(`Sync log updated successfully with completed_at: ${completedAt}`)
      }
      
      console.log(`\n=== NinjaOne Sync Summary ===`)
      console.log(`Devices synced: ${recordsSynced}`)
      console.log(`Devices failed: ${recordsFailed}`)
      console.log(`Duration: ${duration}s`)
      console.log(`========================\n`)

      return NextResponse.json({
        success: true,
        recordsSynced,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined
      })
    } catch (error: any) {
      // Update sync log with failure
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


import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const searchParams = new URL(request.url).searchParams
    const filterType = searchParams.get('filter') || 'all' // 'all', 'ninja-only', 'azure-only'
    
    // Fetch ALL devices first (without filters) so we can deduplicate properly
    // This ensures devices that exist in both systems don't show up incorrectly in filters
    const { data: allDevices, error } = await supabase
      .from('devices')
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .order('device_name', { ascending: true })

    if (error) {
      throw error
    }

    // Deduplicate devices by serial number BEFORE filtering
    // If multiple devices have the same serial number, keep only the best one
    // Priority: 1) Devices in both systems (azure_device_id IS NOT NULL AND is_in_ninja = true)
    //           2) Active devices over inactive
    //           3) Latest last_synced_at
    // This prevents the same device from appearing multiple times with different prefixes
    const deviceMapBySerial = new Map<string, any>()
    
    if (allDevices && allDevices.length > 0) {
      allDevices.forEach((device: any) => {
        const serialNumber = (device.serial_number || '').trim().toUpperCase()
        
        if (!serialNumber) {
          // If no serial number, keep as-is (might be unique devices without serials)
          // Use device ID as key for uniqueness
          const key = `no-serial-${device.id}`
          if (!deviceMapBySerial.has(key)) {
            deviceMapBySerial.set(key, device)
          }
          return
        }
        
        if (!deviceMapBySerial.has(serialNumber)) {
          // First device with this serial number
          deviceMapBySerial.set(serialNumber, device)
        } else {
          // Device with same serial number already exists - decide which to keep
          const existing = deviceMapBySerial.get(serialNumber)!
          
          // Priority 1: Devices in both systems (preferred)
          const existingInBoth = existing.azure_device_id && existing.is_in_ninja
          const currentInBoth = device.azure_device_id && device.is_in_ninja
          
          if (currentInBoth && !existingInBoth) {
            // Current is in both systems, existing is not - use current
            deviceMapBySerial.set(serialNumber, device)
            return
          } else if (!currentInBoth && existingInBoth) {
            // Existing is in both systems, current is not - keep existing
            return
          }
          
          // Priority 2: Active devices over inactive
          const existingIsActive = existing.status === 'active'
          const currentIsActive = device.status === 'active'
          
          if (currentIsActive && !existingIsActive) {
            // Current device is active, existing is inactive - use current
            deviceMapBySerial.set(serialNumber, device)
          } else if (!currentIsActive && existingIsActive) {
            // Existing device is active, current is inactive - keep existing
            // Do nothing, keep existing
          } else {
            // Both are same status - use latest last_synced_at
            const existingDate = existing.last_synced_at || '1970-01-01'
            const currentDate = device.last_synced_at || '1970-01-01'
            
            if (currentDate > existingDate) {
              // Current device is newer - use it instead
              deviceMapBySerial.set(serialNumber, device)
            }
            // Otherwise keep the existing one
          }
        }
      })
    }
    
    // Convert map values back to array
    let deduplicatedDevices = Array.from(deviceMapBySerial.values())
    
    // Apply filters AFTER deduplication
    if (filterType === 'ninja-only') {
      // NinjaOne Only: is_in_ninja = true AND azure_device_id IS NULL
      deduplicatedDevices = deduplicatedDevices.filter(
        (device: any) => device.is_in_ninja === true && !device.azure_device_id
      )
    } else if (filterType === 'azure-only') {
      // Azure Only: azure_device_id IS NOT NULL AND is_in_ninja = false
      deduplicatedDevices = deduplicatedDevices.filter(
        (device: any) => device.azure_device_id && device.is_in_ninja === false
      )
    }
    
    // Sort by device name
    deduplicatedDevices.sort((a: any, b: any) => {
      const nameA = (a.device_name || '').toLowerCase()
      const nameB = (b.device_name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

    const allDeduped = Array.from(deviceMapBySerial.values())
    const counts = {
      all: allDeduped.length,
      inNinja: allDeduped.filter((d: any) => d.is_in_ninja === true).length,
      inAzure: allDeduped.filter((d: any) => !!d.azure_device_id).length,
      ninjaOnly: allDeduped.filter((d: any) => d.is_in_ninja === true && !d.azure_device_id).length,
      azureOnly: allDeduped.filter((d: any) => d.azure_device_id && d.is_in_ninja === false).length,
      inBoth: allDeduped.filter((d: any) => d.is_in_ninja === true && !!d.azure_device_id).length,
    }

    return NextResponse.json({ devices: deduplicatedDevices, counts })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch devices' },
      { status: 500 }
    )
  }
}



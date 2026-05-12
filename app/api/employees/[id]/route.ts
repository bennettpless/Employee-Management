import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    
    // Check if this request might be right after an update (check for recent-update header)
    const recentUpdate = request.headers.get('x-recent-update') === 'true'
    
    // If this might be right after an update, add a delay to allow replication
    // Supabase has replication lag, so we need to wait a bit for updates to propagate
    if (recentUpdate) {
      console.log(`[GET /api/employees/${params.id}] Recent update detected, waiting 500ms for replication...`)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Fetch employee - use same simple query as list endpoint
    // Try multiple times if we detect stale data
    let employee: any = null
    let error: any = null
    const maxAttempts = recentUpdate ? 3 : 1
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Wait before retrying (give replication more time)
        const delay = 500 * (attempt + 1) // 1s, 1.5s, 2s
        console.log(`[GET /api/employees/${params.id}] Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms delay`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      const result = await supabase
      .from('employees')
      .select('*')
      .eq('id', params.id)
      .single()

      employee = result.data
      error = result.error
      
    if (error) {
        if (attempt === maxAttempts - 1) {
      throw error
        }
        continue
      }
      
      if (employee) {
        // Log what we got
        console.log(`[GET /api/employees/${params.id}] Database query result (attempt ${attempt + 1}):`)
        console.log(`  - Department: ${employee.department}`)
        console.log(`  - Phone: ${employee.phone_number}`)
        console.log(`  - Updated at: ${employee.updated_at}`)
        
        // If this is not a recent update request, or we've tried enough, use this data
        if (!recentUpdate || attempt === maxAttempts - 1) {
          break
        }
        
        // For recent updates, check if the updated_at is very old (more than 1 minute)
        // If so, this is definitely stale data and we should retry
        const updatedAt = employee.updated_at ? new Date(employee.updated_at).getTime() : 0
        const now = Date.now()
        const age = now - updatedAt
        
        // If the data is more than 1 minute old and we just updated, it's definitely stale
        if (age > 60000) {
          console.log(`[GET /api/employees/${params.id}] Data is ${age}ms old, likely stale, retrying...`)
          continue
        } else {
          // Data seems reasonably fresh, use it
          break
        }
      }
    }

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    // Manually fetch all devices (including Azure-only) to ensure accurate count
    console.log(`Fetching devices for employee: ${employee.display_name || employee.email} (ID: ${employee.id})`)
    
    const { data: allDevices, error: devicesError } = await supabase
      .from('devices')
      .select('*')
      .eq('employee_id', employee.id)
      .order('device_name', { ascending: true })
    
    if (devicesError) {
      console.error(`❌ Error fetching devices for employee ${employee.id}:`, devicesError)
      employee.devices = []
    } else {
      console.log(`✅ Employee ${employee.display_name || employee.email} (${employee.id}): Found ${allDevices?.length || 0} devices in database`)
      if (allDevices && allDevices.length > 0) {
        allDevices.forEach((device: any, idx: number) => {
          console.log(`  Device ${idx + 1}: ${device.device_name} (id: ${device.id}, azure_id: ${device.azure_device_id}, ninja_id: ${device.ninja_device_id}, employee_id: ${device.employee_id})`)
        })
      } else {
        console.log(`  ⚠️ No devices found for this employee`)
      }
    }
    
    employee.devices = allDevices || []
    
    // Double-check: Verify all devices have the correct employee_id
    if (employee.devices && employee.devices.length > 0) {
      const mismatched = employee.devices.filter((d: any) => d.employee_id !== employee.id)
      if (mismatched.length > 0) {
        console.error(`⚠️ WARNING: Found ${mismatched.length} devices with incorrect employee_id:`)
        mismatched.forEach((d: any) => {
          console.error(`  - ${d.device_name} has employee_id: ${d.employee_id} (expected: ${employee.id})`)
        })
      }
    }

    // Fetch license assignments
    const { data: licenseAssignments } = await supabase
      .from('license_assignments')
      .select(`
        *,
        license:licenses(*)
      `)
      .eq('employee_id', employee.id)
    
    employee.license_assignments = licenseAssignments || []

    // Get device software for each device
    if (employee.devices && employee.devices.length > 0) {
      console.log(`Fetching software for ${employee.devices.length} devices`)
      
      const devicesWithSoftware = await Promise.all(
        employee.devices.map(async (device: any) => {
          try {
            const { data: deviceSoftwareLinks, error: softwareError } = await supabase
              .from('device_software')
              .select(`
                software:software(
                  id,
                  name,
                  version,
                  publisher
                ),
                install_date
              `)
              .eq('device_id', device.id)

            if (softwareError) {
              console.error(`Error fetching software for device ${device.device_name} (${device.id}):`, softwareError)
            }

            // Transform to flat software list - handle case where software might be null
            const software = deviceSoftwareLinks?.filter(link => link.software).map((link: any) => ({
              id: link.software?.id,
              name: link.software?.name,
              version: link.software?.version,
              publisher: link.software?.publisher,
              install_date: link.install_date
            })) || []

            // Sort by software name
            software.sort((a: any, b: any) => a.name.localeCompare(b.name))

            console.log(`Device ${device.device_name}: ${software.length} software items`)

            return {
              ...device,
              software
            }
          } catch (error: any) {
            console.error(`Exception fetching software for device ${device.device_name}:`, error)
            // Return device without software if there's an error
            return {
              ...device,
              software: []
            }
          }
        })
      )
      
      console.log(`Final devices count after software fetch: ${devicesWithSoftware.length}`)
      employee.devices = devicesWithSoftware
    }

    // Get manager info if available
    if (employee.manager_entra_id) {
      const { data: manager } = await supabase
        .from('employees')
        .select('id, display_name, email, job_title')
        .eq('entra_id', employee.manager_entra_id)
        .single()

      employee.manager = manager
    }
    
    // Get previous devices (devices this user used to be registered to)
    const { data: previousDeviceAssignments } = await supabase
      .from('device_assignments_history')
      .select(`
        id,
        device:devices(
          id,
          device_name,
          device_type,
          manufacturer,
          model,
          os_name,
          os_version
        ),
        assignment_date,
        unassignment_date,
        registered_date
      `)
      .eq('employee_id', employee.id)
      .eq('is_current', false)
      .order('unassignment_date', { ascending: false, nullsFirst: false })
      .order('assignment_date', { ascending: false })
    
    // Transform previous device assignments
    const previousDevices = (previousDeviceAssignments || [])
      .filter(assignment => assignment.device) // Only include if device still exists
      .map((assignment: any) => ({
        ...assignment.device,
        assignment_date: assignment.assignment_date,
        unassignment_date: assignment.unassignment_date,
        registered_date: assignment.registered_date
      }))
    
    employee.previous_devices = previousDevices

    // Log what we're returning to help debug
    console.log(`[GET /api/employees/${params.id}] Returning employee data:`)
    console.log(`  - Department: ${employee.department}`)
    console.log(`  - Phone: ${employee.phone_number}`)
    console.log(`  - Office Location: ${employee.office_location}`)
    console.log(`  - Email: ${employee.email}`)

    return NextResponse.json(
      { employee },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (error: any) {
    console.error('Error fetching employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch employee' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    
    // Fetch current employee to get email and entra_id (for Excel lookup and updates)
    const { data: currentEmployee, error: fetchError } = await supabase
      .from('employees')
      .select('email, entra_id, first_name, last_name, display_name')
      .eq('id', params.id)
      .single()
    
    if (fetchError || !currentEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    // Prepare update data (only allow updating specific fields)
    const updateData: any = {}
    const allowedFields = [
      'email', 'first_name', 'last_name', 'display_name', 'job_title', 'department',
      'office_location', 'phone_number', 'extension', 'branch_name', 'type',
      'supervisor', 'dpt_manager', 'nick_name', 'username'
    ]
    
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field] || null
      }
    }
    
    // Auto-update display_name if first_name or last_name changed
    const firstNameChanged = 'first_name' in body && body.first_name !== currentEmployee.first_name
    const lastNameChanged = 'last_name' in body && body.last_name !== currentEmployee.last_name
    if (firstNameChanged || lastNameChanged) {
      const newFirstName = updateData.first_name ?? currentEmployee.first_name
      const newLastName = updateData.last_name ?? currentEmployee.last_name
      updateData.display_name = `${newFirstName || ''} ${newLastName || ''}`.trim() || null
      console.log(`[PUT /api/employees/${params.id}] Auto-updating display_name to: "${updateData.display_name}"`)
    }
    
    // Auto-update entra_id if email changed
    // Always update entra_id to match the new email when email is changed
    const emailChanged = 'email' in body && body.email !== currentEmployee.email
    if (emailChanged) {
      updateData.entra_id = updateData.email
      console.log(`[PUT /api/employees/${params.id}] Auto-updating entra_id from "${currentEmployee.entra_id}" to "${updateData.email}"`)
    }
    
    // Update database
    console.log(`[PUT /api/employees/${params.id}] Updating with data:`, updateData)
    const { data: updatedEmployee, error: updateError } = await supabase
      .from('employees')
      .update({
        ...updateData,
        updated_at: new Date().toISOString() // Force updated_at to change
      })
      .eq('id', params.id)
      .select()
      .single()
    
    if (updateError) {
      console.error(`[PUT /api/employees/${params.id}] Update error:`, updateError)
      throw updateError
    }
    
    if (!updatedEmployee) {
      throw new Error('Employee not found after update')
    }
    
    console.log(`[PUT /api/employees/${params.id}] Update successful:`)
    console.log(`  - Department: ${updatedEmployee.department}`)
    console.log(`  - Phone: ${updatedEmployee.phone_number}`)
    console.log(`  - Updated at: ${updatedEmployee.updated_at}`)
    
    // Verify the update by fetching again with a fresh client
    // Create a completely new Supabase client to avoid any caching
    const verifySupabase = getServiceSupabase()
    const { data: verifyEmployee, error: verifyError } = await verifySupabase
      .from('employees')
      .select('department, phone_number, updated_at')
      .eq('id', params.id)
      .single()
    
    if (!verifyError && verifyEmployee) {
      console.log(`[PUT /api/employees/${params.id}] Verification query:`)
      console.log(`  - Department: ${verifyEmployee.department}`)
      console.log(`  - Phone: ${verifyEmployee.phone_number}`)
      console.log(`  - Updated at: ${verifyEmployee.updated_at}`)
    }
    
    // Return the updated employee from the update response, not from a new query
    // This ensures we return the data that was actually written
    
    return NextResponse.json({ 
      success: true,
      employee: updatedEmployee 
    })
  } catch (error: any) {
    console.error('Error updating employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update employee' },
      { status: 500 }
    )
  }
}

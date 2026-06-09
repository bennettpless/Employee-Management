import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    
    const { data: employee, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) {
      throw error
    }

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    const { data: allDevices, error: devicesError } = await supabase
      .from('devices')
      .select('*')
      .eq('employee_id', employee.id)
      .order('device_name', { ascending: true })
    
    if (devicesError) {
      console.error(`Error fetching devices for employee ${employee.id}:`, devicesError)
    }
    
    employee.devices = allDevices || []

    if (employee.manager_entra_id) {
      const { data: manager } = await supabase
        .from('employees')
        .select('id, display_name, email, job_title')
        .eq('entra_id', employee.manager_entra_id)
        .single()

      employee.manager = manager
    }
    
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
    
    const previousDevices = (previousDeviceAssignments || [])
      .filter(assignment => assignment.device)
      .map((assignment: any) => ({
        ...assignment.device,
        assignment_date: assignment.assignment_date,
        unassignment_date: assignment.unassignment_date,
        registered_date: assignment.registered_date
      }))
    
    employee.previous_devices = previousDevices

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
    
    const updateData: Record<string, any> = {}
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
    
    const firstNameChanged = 'first_name' in body && body.first_name !== currentEmployee.first_name
    const lastNameChanged = 'last_name' in body && body.last_name !== currentEmployee.last_name
    if (firstNameChanged || lastNameChanged) {
      const newFirstName = updateData.first_name ?? currentEmployee.first_name
      const newLastName = updateData.last_name ?? currentEmployee.last_name
      updateData.display_name = `${newFirstName || ''} ${newLastName || ''}`.trim() || null
    }
    
    const emailChanged = 'email' in body && body.email !== currentEmployee.email
    if (emailChanged) {
      updateData.entra_id = updateData.email
    }
    
    const { data: updatedEmployee, error: updateError } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()
    
    if (updateError) {
      console.error('Error updating employee:', updateError)
      throw updateError
    }
    
    if (!updatedEmployee) {
      throw new Error('Employee not found after update')
    }
    
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

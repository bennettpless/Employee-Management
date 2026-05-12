import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { device_name, device_type, device_id } = body
    
    if (!device_id && (!device_name || !device_name.trim())) {
      return NextResponse.json(
        { error: 'Either device_id or device_name is required' },
        { status: 400 }
      )
    }
    
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, email')
      .eq('id', params.id)
      .single()
    
    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }
    
    let resultDeviceId: string
    let resultDeviceName: string
    
    if (device_id) {
      const { data: existingDevice, error: deviceError } = await supabase
        .from('devices')
        .select('*')
        .eq('id', device_id)
        .single()
      
      if (deviceError || !existingDevice) {
        return NextResponse.json(
          { error: 'Device not found' },
          { status: 404 }
        )
      }
      
      if (existingDevice.employee_id === params.id) {
        return NextResponse.json(
          { error: 'Device is already assigned to this employee' },
          { status: 400 }
        )
      }
      
      if (existingDevice.employee_id) {
        await supabase
          .from('device_assignments_history')
          .update({
            is_current: false,
            unassignment_date: new Date().toISOString()
          })
          .eq('device_id', existingDevice.id)
          .eq('employee_id', existingDevice.employee_id)
          .eq('is_current', true)
        
        await supabase
          .from('devices')
          .update({ employee_id: null })
          .eq('id', existingDevice.id)
      }
      
      const { error: assignError } = await supabase
        .from('devices')
        .update({ 
          employee_id: params.id,
          device_type: device_type || existingDevice.device_type || null
        })
        .eq('id', existingDevice.id)
      
      if (assignError) throw assignError
      
      await supabase
        .from('device_assignments_history')
        .insert({
          device_id: existingDevice.id,
          employee_id: params.id,
          assignment_date: new Date().toISOString(),
          is_current: true
        })
      
      resultDeviceId = existingDevice.id
      resultDeviceName = existingDevice.device_name
    } else {
      const deviceName = device_name.trim()
      
      const { data: existingByName } = await supabase
        .from('devices')
        .select('*')
        .eq('device_name', deviceName)
        .maybeSingle()
      
      if (existingByName) {
        if (existingByName.employee_id === params.id) {
          return NextResponse.json(
            { error: 'Device is already assigned to this employee' },
            { status: 400 }
          )
        }
        
        if (existingByName.employee_id) {
          await supabase
            .from('device_assignments_history')
            .update({
              is_current: false,
              unassignment_date: new Date().toISOString()
            })
            .eq('device_id', existingByName.id)
            .eq('employee_id', existingByName.employee_id)
            .eq('is_current', true)
          
          await supabase
            .from('devices')
            .update({ employee_id: null })
            .eq('id', existingByName.id)
        }
        
        const { error: assignError } = await supabase
          .from('devices')
          .update({ 
            employee_id: params.id,
            device_type: device_type || existingByName.device_type || null
          })
          .eq('id', existingByName.id)
        
        if (assignError) throw assignError
        
        await supabase
          .from('device_assignments_history')
          .insert({
            device_id: existingByName.id,
            employee_id: params.id,
            assignment_date: new Date().toISOString(),
            is_current: true
          })
        
        resultDeviceId = existingByName.id
        resultDeviceName = deviceName
      } else {
        const { data: newDevice, error: createError } = await supabase
          .from('devices')
          .insert({
            device_name: deviceName,
            device_type: device_type || null,
            employee_id: params.id,
            ninja_device_id: `manual-${deviceName}-${Date.now()}`,
            is_in_ninja: false,
            status: 'active'
          })
          .select()
          .single()
        
        if (createError) throw createError
        
        await supabase
          .from('device_assignments_history')
          .insert({
            device_id: newDevice.id,
            employee_id: params.id,
            assignment_date: new Date().toISOString(),
            is_current: true
          })
        
        resultDeviceId = newDevice.id
        resultDeviceName = deviceName
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Device added successfully',
      device: { id: resultDeviceId, device_name: resultDeviceName }
    })
  } catch (error: any) {
    console.error('Error adding device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add device' },
      { status: 500 }
    )
  }
}

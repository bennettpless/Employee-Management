import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    
    const email = (body.email || '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }
    
    const firstName = (body.first_name || '').trim()
    const lastName = (body.last_name || '').trim()
    const displayName = firstName && lastName 
      ? `${firstName} ${lastName}` 
      : firstName || lastName || email
    
    const { data: newEmployee, error: insertError } = await supabase
      .from('employees')
      .insert({
        email,
        entra_id: email,
        first_name: firstName || null,
        last_name: lastName || null,
        display_name: displayName,
        job_title: (body.job_title || '').trim() || null,
        department: (body.department || '').trim() || null,
        office_location: (body.office_location || '').trim() || null,
        phone_number: (body.phone_number || '').trim() || null,
        extension: (body.extension || '').trim() || null,
        branch_name: (body.branch_name || '').trim() || null,
        type: (body.type || '').trim() || null,
        supervisor: (body.supervisor || '').trim() || null,
        dpt_manager: (body.dpt_manager || '').trim() || null,
        username: (body.username || '').trim() || null,
        nick_name: (body.nick_name || '').trim() || null,
        duplicate_user_email: (body.duplicate_user_email || '').trim() || null,
        enrolled_in_intune: body.enrolled_in_intune || false,
        ninja_end_user_remote_access: body.ninja_end_user_remote_access || false,
        office_365_mfa: body.office_365_mfa || false,
        employment_status: 'active',
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('Error inserting employee:', insertError)
      throw insertError
    }
    
    const devicesToAssign: Array<{ device_name: string; device_type: string | null; device_id?: string }> = []
    
    if (body.device_id) {
      devicesToAssign.push({ device_name: '', device_type: null, device_id: body.device_id })
    } else if (body.devices && Array.isArray(body.devices)) {
      for (const d of body.devices) {
        if (d.device_id) {
          devicesToAssign.push({ device_name: '', device_type: null, device_id: d.device_id })
        } else if (d.device_name?.trim()) {
          devicesToAssign.push({ device_name: d.device_name.trim(), device_type: d.device_type || null })
        }
      }
    } else if (body.pc_names_active_enrolled) {
      const pcNames = body.pc_names_active_enrolled.toString()
        .split(/[,;]/)
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0)
      
      const pcTypes = (body.pc_type || '').toString()
        .split(/[,;]/)
        .map((type: string) => type.trim())
        .filter((type: string) => type.length > 0)
      
      for (let i = 0; i < pcNames.length; i++) {
        devicesToAssign.push({
          device_name: pcNames[i],
          device_type: pcTypes.length === 1 ? pcTypes[0] : (pcTypes[i] || null)
        })
      }
    }
    
    if (devicesToAssign.length > 0) {
      for (const device of devicesToAssign) {
        if (device.device_id) {
          const { error: assignError } = await supabase
            .from('devices')
            .update({ employee_id: newEmployee.id })
            .eq('id', device.device_id)
          
          if (!assignError) {
            await supabase
              .from('device_assignments_history')
              .insert({
                device_id: device.device_id,
                employee_id: newEmployee.id,
                assignment_date: new Date().toISOString(),
                is_current: true
              })
          }
        } else {
          const { data: newDevice, error: createError } = await supabase
            .from('devices')
            .insert({
              device_name: device.device_name,
              device_type: device.device_type,
              employee_id: newEmployee.id,
              ninja_device_id: `manual-${device.device_name}-${Date.now()}`,
              is_in_ninja: false,
              status: 'active'
            })
            .select('id')
            .single()
          
          if (!createError && newDevice) {
            await supabase
              .from('device_assignments_history')
              .insert({
                device_id: newDevice.id,
                employee_id: newEmployee.id,
                assignment_date: new Date().toISOString(),
                is_current: true
              })
          }
        }
      }
    }
    
    const softwareLicenses: Array<{ software_name: string; has_license: boolean }> = []
    const licenseFields = [
      'autocad', 'autocad_lt', 'aec', 'bim', 'bentley', 'hilti',
      'softrack', 'risa', 'lucid', 'tekla_tedds',
      'tekla_structural_designer', 'tekla_structural_designer_suite', 'etabs'
    ]
    
    for (const field of licenseFields) {
      if (body[field]) {
        softwareLicenses.push({
          software_name: field.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          has_license: true
        })
      }
    }
    
    if (softwareLicenses.length > 0) {
      await supabase
        .from('employee_software_licenses')
        .insert(softwareLicenses.map(l => ({
          employee_id: newEmployee.id,
          software_name: l.software_name,
          has_license: l.has_license
        })))
    }
    
    return NextResponse.json({ 
      success: true,
      employee: newEmployee 
    })
  } catch (error: any) {
    console.error('Error onboarding employee:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to onboard employee' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { closeCurrentAssignments, sanitizeDeviceBody } from '@/lib/devices'
import { currentActor, logAudit } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const { data: device, error } = await supabase
      .from('devices')
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      throw error
    }

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      )
    }

    // Repair/upgrade history log
    const { data: history } = await supabase
      .from('device_history')
      .select('*')
      .eq('device_id', device.id)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })

    // Get device assignment history (current and previous users)
    const { data: assignmentHistory } = await supabase
      .from('device_assignments_history')
      .select(`
        id,
        employee_id,
        employee:employees(
          id,
          display_name,
          email,
          first_name,
          last_name
        ),
        assignment_date,
        unassignment_date,
        registered_date,
        is_current
      `)
      .eq('device_id', device.id)
      .order('assignment_date', { ascending: false })

    // Heal stale is_current rows that don't match devices.employee_id
    // (source of truth). Offboarding / reassignment bugs left these behind.
    const now = new Date().toISOString()
    const orphanIds = (assignmentHistory || [])
      .filter(
        (a: any) =>
          a.is_current &&
          a.employee_id &&
          a.employee_id !== device.employee_id
      )
      .map((a: any) => a.id)
    if (orphanIds.length > 0) {
      await supabase
        .from('device_assignments_history')
        .update({ is_current: false, unassignment_date: now })
        .in('id', orphanIds)
      for (const a of assignmentHistory || []) {
        if (orphanIds.includes(a.id)) {
          a.is_current = false
          a.unassignment_date = a.unassignment_date || now
        }
      }
    }

    const currentAssignments = (assignmentHistory || []).filter(
      (a: any) =>
        a.is_current &&
        a.employee &&
        a.employee_id === device.employee_id
    )
    const previousAssignments = (assignmentHistory || []).filter(
      (a: any) => !a.is_current && a.employee
    )

    previousAssignments.sort((a: any, b: any) => {
      const dateA = a.unassignment_date ? new Date(a.unassignment_date).getTime() : 0
      const dateB = b.unassignment_date ? new Date(b.unassignment_date).getTime() : 0
      return dateB - dateA
    })

    return NextResponse.json({
      device: {
        ...device,
        history: history || [],
        current_users: currentAssignments.map((a: any) => ({
          employee: a.employee,
          assignment_date: a.assignment_date,
          registered_date: a.registered_date
        })),
        previous_users: previousAssignments.map((a: any) => ({
          employee: a.employee,
          assignment_date: a.assignment_date,
          unassignment_date: a.unassignment_date,
          registered_date: a.registered_date
        }))
      }
    })
  } catch (error: any) {
    console.error('Error fetching device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch device' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = (await request.json()) as Record<string, unknown>

    let updateData: Record<string, unknown>
    try {
      updateData = sanitizeDeviceBody(body)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
    }

    const { data: existing, error: fetchError } = await supabase
      .from('devices')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    const assigneeChanging =
      'employee_id' in updateData && updateData.employee_id !== existing.employee_id

    const { data: device, error } = await supabase
      .from('devices')
      .update(updateData)
      .eq('id', params.id)
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A device with that asset tag already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    if (assigneeChanging) {
      const now = new Date().toISOString()
      // Close every open history row for this device (not just the prior
      // employee_id) so stale is_current rows can't linger.
      await closeCurrentAssignments(supabase, params.id, now)
      if (updateData.employee_id) {
        await supabase.from('device_assignments_history').insert({
          device_id: params.id,
          employee_id: updateData.employee_id,
          assignment_date: now,
          is_current: true,
        })
      }
    }

    // Audit: log only fields that actually changed
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const [field, value] of Object.entries(updateData)) {
      if ((existing as any)[field] !== value) {
        changes[field] = { from: (existing as any)[field] ?? null, to: value }
      }
    }
    if (Object.keys(changes).length > 0) {
      await logAudit({
        actor: await currentActor(),
        action: assigneeChanging ? 'device.assign' : 'device.update',
        entity_type: 'device',
        entity_id: device.id,
        entity_label: device.device_name || device.asset_tag || device.serial_number,
        details: {
          changes,
          ...(assigneeChanging
            ? { assigned_to: device.employee?.display_name || device.employee?.email || null }
            : {}),
        },
      })
    }

    return NextResponse.json({ device })
  } catch (error: any) {
    console.error('Error updating device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update device' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()

    const { data: existing } = await supabase
      .from('devices')
      .select('id, device_name, asset_tag, serial_number')
      .eq('id', params.id)
      .maybeSingle()

    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    if (existing) {
      await logAudit({
        actor: await currentActor(),
        action: 'device.delete',
        entity_type: 'device',
        entity_id: existing.id,
        entity_label: existing.device_name || existing.asset_tag || existing.serial_number,
        details: { serial_number: existing.serial_number, asset_tag: existing.asset_tag },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete device' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { closeCurrentAssignments, insertAssignmentHistory, sanitizeDeviceBody } from '@/lib/devices'
import { currentActor, logAudit } from '@/lib/audit'
import {
  closeOpenLoanerCheckouts,
  employeeSnapshotFrom,
  fetchEmployeeSnapshot,
  loanerFieldsForAssignment,
  openLoanerCheckout,
} from '@/lib/loaner-checkout'
import { consumeSkipError, parseChargeOfficeInput } from '@/lib/stock-tracker'
import { maybeConsumeStockLot, requireChargeOffice, setDeviceNotFromStock } from '@/lib/stock-consume'

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

    const { data: loanerCheckouts } = await supabase
      .from('loaner_checkouts')
      .select('*')
      .eq('device_id', device.id)
      .order('checked_out_at', { ascending: false })

    // Get device assignment history (current and previous users)
    const { data: assignmentHistory } = await supabase
      .from('device_assignments_history')
      .select(`
        id,
        employee_id,
        employee_name,
        employee_email,
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

    const assignmentPerson = (a: any) => {
      if (a.employee) return a.employee
      if (a.employee_name || a.employee_email) {
        return {
          id: a.employee_id,
          display_name: a.employee_name,
          email: a.employee_email || '',
          first_name: null,
          last_name: null,
        }
      }
      return null
    }

    const currentAssignments = (assignmentHistory || []).filter(
      (a: any) =>
        a.is_current &&
        assignmentPerson(a) &&
        a.employee_id === device.employee_id
    )
    const previousAssignments = (assignmentHistory || []).filter(
      (a: any) => !a.is_current && assignmentPerson(a)
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
          employee: assignmentPerson(a),
          assignment_date: a.assignment_date,
          registered_date: a.registered_date
        })),
        previous_users: previousAssignments.map((a: any) => ({
          employee: assignmentPerson(a),
          assignment_date: a.assignment_date,
          unassignment_date: a.unassignment_date,
          registered_date: a.registered_date
        })),
        loaner_checkouts: loanerCheckouts || [],
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

    const nextIsLoaner =
      'is_loaner' in updateData ? Boolean(updateData.is_loaner) : Boolean(existing.is_loaner)
    const nextEmployeeId = (
      'employee_id' in updateData ? updateData.employee_id : existing.employee_id
    ) as string | null
    const nextDue = (
      'loaner_due_date' in updateData ? updateData.loaner_due_date : existing.loaner_due_date
    ) as string | null

    const loanerNext = loanerFieldsForAssignment({
      isLoaner: nextIsLoaner,
      nextEmployeeId,
      dueDate: nextDue,
      existingCheckedOutAt: existing.loaner_checked_out_at,
      assigneeChanging: assigneeChanging || (!existing.employee_id && Boolean(nextEmployeeId)),
      becomingLoaner: nextIsLoaner && !existing.is_loaner,
    })
    updateData.loaner_due_date = loanerNext.loaner_due_date
    updateData.loaner_checked_out_at = loanerNext.loaner_checked_out_at

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

    let stockLotPrompt = undefined as Awaited<ReturnType<typeof maybeConsumeStockLot>>['prompt']
    const lotId = body.lot_id ? String(body.lot_id) : null
    const notFromStock = Boolean(body.not_from_stock)
    let chargeOffice: string | null = null
    const willAssign = Boolean(nextEmployeeId)
    const taggedLot = lotId || existing.stock_lot_id || null
    if (taggedLot && !notFromStock && willAssign) {
      const charge = await requireChargeOffice(parseChargeOfficeInput(body), supabase)
      if (!charge.ok) {
        return NextResponse.json({ error: charge.error }, { status: 400 })
      }
      chargeOffice = charge.office
    }

    if (assigneeChanging) {
      const now = new Date().toISOString()
      await closeCurrentAssignments(supabase, params.id, now)
      if (updateData.employee_id) {
        await insertAssignmentHistory(supabase, {
          deviceId: params.id,
          employeeId: updateData.employee_id as string,
          assignmentDate: now,
          snapshot: employeeSnapshotFrom(device.employee),
        })
        const consume = await maybeConsumeStockLot(supabase, {
          device: existing,
          nextEmployeeId: updateData.employee_id as string,
          actor: await currentActor(),
          lotId,
          notFromStock,
          chargeOffice,
        })
        const skipError = consumeSkipError(consume.skipped)
        if (skipError) {
          return NextResponse.json({ error: skipError }, { status: 400 })
        }
        stockLotPrompt = consume.prompt
      }
    } else if (lotId && !notFromStock) {
      const consume = await maybeConsumeStockLot(supabase, {
        device: existing,
        nextEmployeeId: nextEmployeeId,
        actor: await currentActor(),
        force: true,
        lotId,
        notFromStock: false,
        chargeOffice,
      })
      const skipError = consumeSkipError(consume.skipped)
      if (skipError) {
        return NextResponse.json({ error: skipError }, { status: 400 })
      }
      stockLotPrompt = consume.prompt
    } else if (notFromStock) {
      await setDeviceNotFromStock(supabase, params.id, true)
    }

    if (loanerNext.shouldCloseCheckout) {
      await closeOpenLoanerCheckouts(supabase, params.id)
    } else if (loanerNext.shouldOpenCheckout) {
      let snapshot = employeeSnapshotFrom(device.employee)
      if (!snapshot.name && !snapshot.email) {
        snapshot = await fetchEmployeeSnapshot(supabase, nextEmployeeId)
      }
      await openLoanerCheckout(supabase, {
        deviceId: params.id,
        employeeId: nextEmployeeId,
        snapshot,
        dueDate: loanerNext.loaner_due_date,
        checkedOutAt: loanerNext.loaner_checked_out_at || undefined,
      })
    } else if (nextIsLoaner && nextEmployeeId && nextDue !== existing.loaner_due_date) {
      await supabase
        .from('loaner_checkouts')
        .update({ due_date: loanerNext.loaner_due_date })
        .eq('device_id', params.id)
        .is('returned_at', null)
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

    return NextResponse.json({ device, stock_lot: stockLotPrompt || null })
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

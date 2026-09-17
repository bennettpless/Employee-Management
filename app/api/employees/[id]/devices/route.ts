import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { closeCurrentAssignments, insertAssignmentHistory } from '@/lib/devices'
import { applyLoanerOnAssign, applyLoanerOnReturn, employeeSnapshotFrom } from '@/lib/loaner-checkout'
import { maybeConsumeStockLot, requireChargeOffice } from '@/lib/stock-consume'
import { consumeSkipError, parseChargeOfficeInput } from '@/lib/stock-tracker'
import { currentActor } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    const body = await request.json()
    const { device_id, loaner_due_date } = body

    if (!device_id) {
      return NextResponse.json(
        { error: 'Pick a device that is already in inventory' },
        { status: 400 }
      )
    }

    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, email, display_name, first_name, last_name, office_location')
      .eq('id', params.id)
      .single()

    if (empError || !employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

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

    let chargeOffice: string | null = null
    const chargeInput = parseChargeOfficeInput(body)
    if (chargeInput) {
      const charge = await requireChargeOffice(chargeInput, supabase)
      if (!charge.ok) {
        return NextResponse.json({ error: charge.error }, { status: 400 })
      }
      chargeOffice = charge.office
    }

    if (existingDevice.employee_id) {
      const now = new Date().toISOString()
      await closeCurrentAssignments(supabase, existingDevice.id, now)
      await applyLoanerOnReturn(supabase, existingDevice.id, now)

      await supabase
        .from('devices')
        .update({ employee_id: null })
        .eq('id', existingDevice.id)
    }

    const { error: assignError } = await supabase
      .from('devices')
      .update({
        employee_id: params.id,
        device_type: body.device_type || existingDevice.device_type || null,
        status: existingDevice.status === 'in_stock' ? 'active' : existingDevice.status,
      })
      .eq('id', existingDevice.id)

    if (assignError) throw assignError

    const snapshot = employeeSnapshotFrom(employee)
    await insertAssignmentHistory(supabase, {
      deviceId: existingDevice.id,
      employeeId: params.id,
      snapshot,
    })
    await applyLoanerOnAssign(supabase, {
      deviceId: existingDevice.id,
      isLoaner: Boolean(existingDevice.is_loaner),
      employeeId: params.id,
      snapshot,
      dueDate: loaner_due_date || null,
    })
    const consume = await maybeConsumeStockLot(supabase, {
      device: existingDevice,
      nextEmployeeId: params.id,
      actor: await currentActor(),
      lotId: body.lot_id ? String(body.lot_id) : null,
      notFromStock: Boolean(body.not_from_stock),
      chargeOffice,
    })
    const skipError = consumeSkipError(consume.skipped)
    if (skipError && consume.skipped !== 'charge-office-required') {
      return NextResponse.json({ error: skipError }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Device added successfully',
      device: { id: existingDevice.id, device_name: existingDevice.device_name },
      stock_lot: consume.prompt || null,
      skipped: consume.skipped || null,
    })
  } catch (error: any) {
    console.error('Error adding device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add device' },
      { status: 500 }
    )
  }
}

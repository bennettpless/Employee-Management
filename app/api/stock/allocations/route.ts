import { NextRequest, NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import { currentActor } from '@/lib/audit'
import { getServiceSupabase } from '@/lib/supabase'
import {
  chargeLotToOffice,
  maybeConsumeStockLot,
  requireChargeOffice,
  setDeviceNotFromStock,
} from '@/lib/stock-consume'
import { consumeSkipError, parseChargeOfficeInput } from '@/lib/stock-tracker'

export async function POST(request: NextRequest) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await request.json()) as Record<string, unknown>
    const deviceId = String(body.device_id || '').trim()
    const lotId = body.lot_id ? String(body.lot_id) : null
    const notFromStock = Boolean(body.not_from_stock)
    const supabase = getServiceSupabase()
    const actor = await currentActor()

    if (!deviceId && lotId) {
      const charge = await requireChargeOffice(parseChargeOfficeInput(body), supabase)
      if (!charge.ok) {
        return NextResponse.json({ error: charge.error }, { status: 400 })
      }
      const quantity = body.quantity == null ? 1 : Number(body.quantity)
      const result = await chargeLotToOffice(supabase, {
        lotId,
        office: charge.office,
        quantity,
        actor,
      })
      const skipError = consumeSkipError(result.skipped)
      if (skipError) {
        return NextResponse.json({ error: skipError }, { status: 400 })
      }
      return NextResponse.json({ allocation_id: result.id })
    }

    if (!deviceId) {
      return NextResponse.json({ error: 'device_id is required' }, { status: 400 })
    }

    if (notFromStock) {
      const { data: device, error } = await supabase
        .from('devices')
        .select('id')
        .eq('id', deviceId)
        .maybeSingle()
      if (error) throw error
      if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
      await setDeviceNotFromStock(supabase, deviceId, true)
      return NextResponse.json({ skipped: 'not-from-stock' })
    }
    if (!lotId) {
      return NextResponse.json({ error: 'lot_id or not_from_stock is required' }, { status: 400 })
    }

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle()
    if (error) throw error
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    const employeeId =
      device.employee_id || (body.employee_id ? String(body.employee_id) : null)
    let chargeOffice: string | null = null
    if (employeeId) {
      const charge = await requireChargeOffice(parseChargeOfficeInput(body), supabase)
      if (!charge.ok) {
        return NextResponse.json({ error: charge.error }, { status: 400 })
      }
      chargeOffice = charge.office
    }
    const consume = await maybeConsumeStockLot(supabase, {
      device,
      nextEmployeeId: employeeId,
      actor,
      force: true,
      lotId,
      chargeOffice,
    })
    const skipError = consumeSkipError(consume.skipped)
    if (skipError) {
      return NextResponse.json({ error: skipError }, { status: 400 })
    }
    return NextResponse.json({
      stock_lot: consume.prompt || null,
      skipped: consume.skipped || null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to charge purchase lot'
    console.error('Error creating stock allocation:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

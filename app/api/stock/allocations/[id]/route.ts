import { NextRequest, NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import { currentActor, logAudit } from '@/lib/audit'
import { getServiceSupabase } from '@/lib/supabase'
import { moneyNumber, roundMoney, parseChargeOfficeInput } from '@/lib/stock-tracker'
import { fetchLotsWithMetrics, requireChargeOffice, setDeviceNotFromStock } from '@/lib/stock-consume'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const supabase = getServiceSupabase()
    const { data: existing, error: fetchError } = await supabase
      .from('asset_allocations')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })

    const body = (await request.json()) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    const attachingLot = 'lot_id' in body && Boolean(body.lot_id)
    const officeInput = parseChargeOfficeInput(body)

    if (attachingLot || officeInput) {
      const charge = await requireChargeOffice(officeInput)
      if (!charge.ok) {
        return NextResponse.json({ error: charge.error }, { status: 400 })
      }
      updates.office = charge.office
    }
    if ('lot_id' in body) {
      const lotId = body.lot_id ? String(body.lot_id) : null
      if (lotId) {
        const lots = await fetchLotsWithMetrics()
        const lot = lots.find((l) => l.id === lotId)
        if (!lot) return NextResponse.json({ error: 'Lot not found' }, { status: 404 })
        const extra = existing.lot_id === lotId ? 0 : existing.quantity
        if (lot.qty_in_stock < extra) {
          return NextResponse.json({ error: `Only ${lot.qty_in_stock} remaining in this lot` }, { status: 400 })
        }
        updates.lot_id = lotId
        updates.unit_cost = moneyNumber(lot.unit_cost)
        updates.allocated_cost = roundMoney(moneyNumber(lot.unit_cost) * existing.quantity)
      } else {
        updates.lot_id = null
        updates.unit_cost = null
        updates.allocated_cost = null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('asset_allocations')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) throw error

    if (data.device_id && updates.lot_id) {
      await setDeviceNotFromStock(supabase, data.device_id, false)
    }

    await logAudit({
      actor: await currentActor(),
      action: 'stock.allocation.update',
      entity_type: 'device',
      entity_id: params.id,
      entity_label: data.office,
      details: { updates },
    })
    return NextResponse.json({ allocation: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update allocation'
    console.error('Error updating allocation:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const supabase = getServiceSupabase()
    const { data: existing, error: fetchError } = await supabase
      .from('asset_allocations')
      .select('id, office, device_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Allocation not found' }, { status: 404 })

    const { error } = await supabase.from('asset_allocations').delete().eq('id', params.id)
    if (error) throw error

    if (existing.device_id) {
      await setDeviceNotFromStock(supabase, existing.device_id, true)
    }

    await logAudit({
      actor: await currentActor(),
      action: 'stock.allocation.delete',
      entity_type: 'device',
      entity_id: params.id,
      entity_label: existing.office,
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete allocation'
    console.error('Error deleting allocation:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

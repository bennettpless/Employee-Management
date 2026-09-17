import { NextRequest, NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import { currentActor, logAudit } from '@/lib/audit'
import { getServiceSupabase } from '@/lib/supabase'
import {
  assertLotMakeModel,
  assertQtyPurchased,
  isStockAssetType,
  moneyNumber,
} from '@/lib/stock-tracker'
import { fetchLotsWithMetrics } from '@/lib/stock-consume'

function emptyToNull(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length === 0 ? null : s
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const lots = await fetchLotsWithMetrics()
    const existing = lots.find((l) => l.id === params.id)
    if (!existing) return NextResponse.json({ error: 'Lot not found' }, { status: 404 })

    const body = (await request.json()) as Record<string, unknown>
    const updates: Record<string, unknown> = {}

    if ('item_id' in body) {
      const itemId = String(body.item_id || '').trim()
      if (!itemId) return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
      updates.item_id = itemId
    }
    if ('purchase_date' in body) {
      const purchaseDate = String(body.purchase_date || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
        return NextResponse.json({ error: 'Purchase date is required' }, { status: 400 })
      }
      updates.purchase_date = purchaseDate
    }
    if ('vendor' in body) updates.vendor = emptyToNull(body.vendor)
    if ('item_description' in body) updates.item_description = emptyToNull(body.item_description)
    if ('asset_type' in body) {
      const assetType = String(body.asset_type || '').trim()
      if (!isStockAssetType(assetType)) {
        return NextResponse.json(
          { error: 'Asset type must be a stock lot type (laptop, desktop, server, SSD, RAM, monitor, or other)' },
          { status: 400 }
        )
      }
      updates.asset_type = assetType
    }
    if ('unit_cost' in body) {
      const unitCost = moneyNumber(body.unit_cost)
      if (unitCost < 0) return NextResponse.json({ error: 'Unit cost cannot be negative' }, { status: 400 })
      updates.unit_cost = unitCost
    }
    if ('qty_purchased' in body) {
      const qtyPurchased = Number(body.qty_purchased)
      const qtyCheck = assertQtyPurchased(qtyPurchased, existing.qty_assigned)
      if (!qtyCheck.ok) return NextResponse.json({ error: qtyCheck.error }, { status: 400 })
      updates.qty_purchased = qtyPurchased
    }

    if ('manufacturer' in body || 'model' in body) {
      const hardware = assertLotMakeModel(
        'manufacturer' in body ? body.manufacturer : existing.manufacturer,
        'model' in body ? body.model : existing.model
      )
      if (!hardware.ok) return NextResponse.json({ error: hardware.error }, { status: 400 })
      updates.manufacturer = hardware.manufacturer
      updates.model = hardware.model
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const actor = await currentActor()
    updates.updated_by = actor
    updates.updated_at = new Date().toISOString()

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('asset_purchase_lots')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) throw error

    await logAudit({
      actor,
      action: 'stock.lot.update',
      entity_type: 'device',
      entity_id: params.id,
      entity_label: String(data.item_id),
      details: { updates },
    })
    return NextResponse.json({ lot: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update lot'
    console.error('Error updating stock lot:', error)
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
    const lots = await fetchLotsWithMetrics()
    const existing = lots.find((l) => l.id === params.id)
    if (!existing) return NextResponse.json({ error: 'Lot not found' }, { status: 404 })
    if (existing.qty_assigned > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a lot that already has allocations' },
        { status: 400 }
      )
    }
    const supabase = getServiceSupabase()
    const { error } = await supabase.from('asset_purchase_lots').delete().eq('id', params.id)
    if (error) throw error
    await logAudit({
      actor: await currentActor(),
      action: 'stock.lot.delete',
      entity_type: 'device',
      entity_id: params.id,
      entity_label: existing.item_id,
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete lot'
    console.error('Error deleting stock lot:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import { currentActor, logAudit } from '@/lib/audit'
import { getServiceSupabase } from '@/lib/supabase'
import {
  assertLotMakeModel,
  assertQtyPurchased,
  isLotVisibleOnTracker,
  isStockAssetType,
  moneyNumber,
} from '@/lib/stock-tracker'
import { fetchChargeOffices, fetchLotsWithMetrics } from '@/lib/stock-consume'

function emptyToNull(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length === 0 ? null : s
}

export async function GET() {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const lots = (await fetchLotsWithMetrics()).filter((lot) => isLotVisibleOnTracker(lot))
    const remainingBalance = lots.reduce((sum, lot) => sum + lot.stock_value, 0)
    const supabase = getServiceSupabase()
    const chargeOffices = await fetchChargeOffices(supabase)
    const { data: unmatched } = await supabase
      .from('asset_allocations')
      .select(
        `
        id, device_id, assigned_date, office, quantity, source,
        device:devices(
          serial_number, manufacturer, model, device_name, asset_type,
          employee:employees(display_name, email, first_name, last_name)
        )
      `
      )
      .is('lot_id', null)
      .order('assigned_date', { ascending: false })
    const unmatchedRows = ((unmatched || []) as any[]).map((row) => {
      const employee = row.device?.employee
      const userName =
        employee?.display_name ||
        `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() ||
        employee?.email ||
        null
      return {
        id: row.id,
        device_id: row.device_id,
        assigned_date: row.assigned_date,
        office: row.office,
        quantity: row.quantity,
        source: row.source,
        serial_number: row.device?.serial_number || null,
        manufacturer: row.device?.manufacturer || null,
        model: row.device?.model || null,
        asset_type: row.device?.asset_type || null,
        device_name: row.device?.device_name || null,
        user_name: userName,
      }
    })
    return NextResponse.json({
      lots,
      remaining_balance: remainingBalance,
      unmatched: unmatchedRows,
      charge_offices: chargeOffices,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load lots'
    console.error('Error listing stock lots:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await request.json()) as Record<string, unknown>
    const itemId = String(body.item_id || '').trim()
    const purchaseDate = String(body.purchase_date || '').trim()
    const assetType = String(body.asset_type || '').trim()
    const qtyPurchased = Number(body.qty_purchased)
    const unitCost = moneyNumber(body.unit_cost)

    if (!itemId) return NextResponse.json({ error: 'Item ID is required' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      return NextResponse.json({ error: 'Purchase date is required' }, { status: 400 })
    }
    if (!isStockAssetType(assetType)) {
      return NextResponse.json(
        { error: 'Asset type must be a stock lot type (laptop, desktop, server, SSD, RAM, monitor, or other)' },
        { status: 400 }
      )
    }
    const qtyCheck = assertQtyPurchased(qtyPurchased, 0)
    if (!qtyCheck.ok) return NextResponse.json({ error: qtyCheck.error }, { status: 400 })
    if (unitCost < 0) return NextResponse.json({ error: 'Unit cost cannot be negative' }, { status: 400 })
    const hardware = assertLotMakeModel(body.manufacturer, body.model)
    if (!hardware.ok) return NextResponse.json({ error: hardware.error }, { status: 400 })

    const actor = await currentActor()
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('asset_purchase_lots')
      .insert({
        item_id: itemId,
        purchase_date: purchaseDate,
        vendor: emptyToNull(body.vendor),
        item_description: emptyToNull(body.item_description),
        qty_purchased: qtyPurchased,
        unit_cost: unitCost,
        asset_type: assetType,
        manufacturer: hardware.manufacturer,
        model: hardware.model,
        created_by: actor,
        updated_by: actor,
      })
      .select('*')
      .single()
    if (error) throw error

    await logAudit({
      actor,
      action: 'stock.lot.create',
      entity_type: 'device',
      entity_id: data.id,
      entity_label: itemId,
      details: { qty_purchased: qtyPurchased, unit_cost: unitCost },
    })
    return NextResponse.json({ lot: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create lot'
    console.error('Error creating stock lot:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

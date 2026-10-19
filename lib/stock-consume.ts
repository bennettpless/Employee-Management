import { getServiceSupabase } from '@/lib/supabase'
import {
  chargedUnitCost,
  computeLotMetrics,
  moneyNumber,
  resolveTotalPurchaseCost,
  remainingQty,
  resolveStockLot,
  resolveTaggedLotId,
  roundMoney,
  shouldConsumeStock,
  ymdInTimeZone,
  assertChargeOffice,
  chargeOfficeOptions,
  UNSPECIFIED_OFFICE,
  type LotWithMetrics,
  type PurchaseLot,
  type StockAllocation,
  type StockLotResolution,
} from '@/lib/stock-tracker'

type QueryClient = { from: (table: string) => any }

export interface StockLotCandidate {
  id: string
  item_id: string
  purchase_date: string
  qty_in_stock: number
  unit_cost: number
  asset_type: string
  manufacturer: string | null
  model: string | null
}

export interface StockLotPrompt {
  determined: boolean
  status: 'unique' | 'none' | 'ambiguous'
  allocation_id: string | null
  selected_lot_id: string | null
  candidates: StockLotCandidate[]
  skipped?: string
}

type LotAllocationRow = Pick<StockAllocation, 'lot_id' | 'quantity'> & {
  assigned_date?: string | null
  recorded_date?: string | null
}

export function enrichLots(lots: PurchaseLot[], allocations: LotAllocationRow[]): LotWithMetrics[] {
  const assignedByLot = new Map<string, number>()
  const lastAssignedByLot = new Map<string, string>()
  for (const row of allocations) {
    if (!row.lot_id) continue
    assignedByLot.set(row.lot_id, (assignedByLot.get(row.lot_id) || 0) + row.quantity)
    const assigned = String(row.recorded_date || row.assigned_date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assigned)) continue
    const prev = lastAssignedByLot.get(row.lot_id)
    if (!prev || assigned > prev) lastAssignedByLot.set(row.lot_id, assigned)
  }
  return lots.map((lot) => {
    const qty_assigned = assignedByLot.get(lot.id) || 0
    const metrics = computeLotMetrics(
      lot.qty_purchased,
      resolveTotalPurchaseCost(lot),
      qty_assigned
    )
    return {
      ...lot,
      unit_cost: moneyNumber(lot.unit_cost),
      qty_assigned,
      last_assigned_date: lastAssignedByLot.get(lot.id) || null,
      ...metrics,
    }
  })
}

export async function fetchLotsWithMetrics(
  supabase: QueryClient = getServiceSupabase()
): Promise<LotWithMetrics[]> {
  const { data: lots, error: lotError } = await supabase
    .from('asset_purchase_lots')
    .select('*')
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (lotError) throw lotError

  const ids = (lots || []).map((l: PurchaseLot) => l.id)
  let allocations: LotAllocationRow[] = []
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('asset_allocations')
      .select('lot_id, quantity, assigned_date, recorded_date')
      .in('lot_id', ids)
    if (error) throw error
    allocations = data || []
  }
  return enrichLots((lots || []) as PurchaseLot[], allocations)
}

export function toLotCandidates(lots: LotWithMetrics[]): StockLotCandidate[] {
  return lots.map((lot) => ({
    id: lot.id,
    item_id: lot.item_id,
    purchase_date: lot.purchase_date,
    qty_in_stock: lot.qty_in_stock,
    unit_cost: chargedUnitCost(lot),
    asset_type: lot.asset_type,
    manufacturer: lot.manufacturer,
    model: lot.model,
  }))
}

export function promptFromResolution(
  resolution: StockLotResolution<LotWithMetrics>,
  allocationId: string | null,
  selectedLotId: string | null
): StockLotPrompt {
  return {
    determined: resolution.determined,
    status: resolution.status,
    allocation_id: allocationId,
    selected_lot_id: selectedLotId,
    candidates: toLotCandidates(resolution.matches),
  }
}

/** Lot dropdown for review even when we are not charging yet (e.g. unassigned Ninja PCs). */
export function promptForDevice(
  lots: LotWithMetrics[],
  device: { asset_type?: string | null; manufacturer?: string | null; model?: string | null },
  allocationId: string | null = null
): StockLotPrompt {
  const resolution = resolveStockLot(lots, device)
  return promptFromResolution(resolution, allocationId, resolution.lot?.id || null)
}

export async function fetchChargeOffices(
  supabase: QueryClient = getServiceSupabase()
): Promise<string[]> {
  const { data, error } = await supabase.from('offices').select('name')
  if (error) throw error
  return chargeOfficeOptions((data || []).map((row: { name?: string | null }) => row.name))
}

export async function requireChargeOffice(
  raw: unknown,
  supabase: QueryClient = getServiceSupabase()
): Promise<{ ok: true; office: string } | { ok: false; error: string }> {
  const allowed = await fetchChargeOffices(supabase)
  return assertChargeOffice(raw, allowed)
}

async function insertAllocation(
  supabase: QueryClient,
  opts: {
    deviceId: string | null
    lot: LotWithMetrics | null
    office: string
    assignedDate: string
    actor?: string | null
    quantity?: number
    source?: 'auto' | 'manual'
  }
): Promise<{ id: string | null; skipped?: string }> {
  const unitCost = opts.lot ? chargedUnitCost(opts.lot) : null
  const quantity = opts.quantity && opts.quantity > 0 ? opts.quantity : 1
  const { data: inserted, error } = await supabase
    .from('asset_allocations')
    .insert({
      lot_id: opts.lot ? opts.lot.id : null,
      device_id: opts.deviceId,
      assigned_date: opts.assignedDate,
      recorded_date: ymdInTimeZone(new Date()),
      office: opts.office,
      quantity,
      unit_cost: opts.lot ? unitCost : null,
      allocated_cost: opts.lot ? roundMoney((unitCost || 0) * quantity) : null,
      source: opts.source || 'auto',
      created_by: opts.actor || null,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { id: null, skipped: 'already-allocated' }
    }
    console.error('stock allocation insert failed:', error.message)
    return { id: null, skipped: 'insert-failed' }
  }
  return { id: inserted?.id || null }
}

export function shouldSkipStockBecauseNotFromStock(opts: {
  notFromStock?: boolean
  deviceNotFromStock?: boolean | null
  lotId?: string | null
}): boolean {
  if (opts.lotId) return false
  return Boolean(opts.notFromStock || opts.deviceNotFromStock)
}

export async function setDeviceNotFromStock(
  supabase: QueryClient,
  deviceId: string,
  notFromStock: boolean
): Promise<void> {
  const { error: flagError } = await supabase
    .from('devices')
    .update({
      not_from_stock: notFromStock,
      ...(notFromStock ? { stock_lot_id: null } : {}),
    })
    .eq('id', deviceId)
  if (flagError) throw flagError
  if (notFromStock) {
    const { error } = await supabase.from('asset_allocations').delete().eq('device_id', deviceId)
    if (error) throw error
  }
}

export async function setDeviceStockLot(
  supabase: QueryClient,
  deviceId: string,
  lotId: string
): Promise<void> {
  const { error } = await supabase
    .from('devices')
    .update({ stock_lot_id: lotId, not_from_stock: false })
    .eq('id', deviceId)
  if (error) throw error
}

export async function maybeConsumeStockLot(
  supabase: QueryClient,
  opts: {
    device: {
      id: string
      asset_type?: string | null
      manufacturer?: string | null
      model?: string | null
      location?: string | null
      is_loaner?: boolean | null
      status?: string | null
      employee_id?: string | null
      not_from_stock?: boolean | null
      stock_lot_id?: string | null
    }
    nextEmployeeId: string | null | undefined
    actor?: string | null
    assignedDate?: string
    force?: boolean
    lotId?: string | null
    notFromStock?: boolean
    chargeOffice?: string | null
  }
): Promise<{ consumed: boolean; unmatched: boolean; skipped?: string; prompt?: StockLotPrompt }> {
  try {
    const lotId = resolveTaggedLotId({
      lotId: opts.lotId,
      stockLotId: opts.device.stock_lot_id,
    })
    if (
      shouldSkipStockBecauseNotFromStock({
        notFromStock: opts.notFromStock,
        deviceNotFromStock: opts.device.not_from_stock,
        lotId,
      })
    ) {
      if (opts.notFromStock) {
        await setDeviceNotFromStock(supabase, opts.device.id, true)
      }
      return { consumed: false, unmatched: false, skipped: 'not-from-stock' }
    }

    const { data: existing } = await supabase
      .from('asset_allocations')
      .select('id')
      .eq('device_id', opts.device.id)
      .maybeSingle()

    const consume = shouldConsumeStock({
      assetType: opts.device.asset_type,
      isLoaner: Boolean(opts.device.is_loaner),
      previousStatus: opts.device.status,
      previousEmployeeId: opts.device.employee_id,
      nextEmployeeId: opts.nextEmployeeId,
      alreadyAllocated: Boolean(existing?.id),
      force: opts.force,
    })

    const lots = await fetchLotsWithMetrics(supabase)
    const resolution = resolveStockLot(lots, {
      asset_type: opts.device.asset_type,
      manufacturer: opts.device.manufacturer,
      model: opts.device.model,
    })

    const pickLot = ():
      | { ok: true; lot: LotWithMetrics }
      | { ok: false; skipped: string } => {
      if (!lotId) return { ok: false, skipped: 'lot-not-found' }
      const explicit = lots.find((l) => l.id === lotId) || null
      if (!explicit) return { ok: false, skipped: 'lot-not-found' }
      if (remainingQty(explicit.qty_purchased, explicit.qty_assigned) < 1) {
        return { ok: false, skipped: 'lot-empty' }
      }
      return { ok: true, lot: explicit }
    }

    if (!consume) {
      if (existing?.id) {
        return { consumed: false, unmatched: false, skipped: 'not-eligible' }
      }
      if (lotId) {
        const picked = pickLot()
        if (!picked.ok) {
          return {
            consumed: false,
            unmatched: false,
            skipped: picked.skipped,
            prompt: promptFromResolution(resolution, null, null),
          }
        }
        await setDeviceStockLot(supabase, opts.device.id, picked.lot.id)
        return {
          consumed: false,
          unmatched: false,
          skipped: 'lot-tagged',
          prompt: promptFromResolution(resolution, null, picked.lot.id),
        }
      }
      return {
        consumed: false,
        unmatched: false,
        skipped: 'not-eligible',
        prompt: promptForDevice(lots, opts.device),
      }
    }

    let chosen: LotWithMetrics | null = null
    if (lotId) {
      const picked = pickLot()
      if (!picked.ok) {
        return {
          consumed: false,
          unmatched: false,
          skipped: picked.skipped,
          prompt: promptFromResolution(resolution, null, null),
        }
      }
      if (!opts.chargeOffice) {
        return {
          consumed: false,
          unmatched: false,
          skipped: 'charge-office-required',
          prompt: promptFromResolution(resolution, null, picked.lot.id),
        }
      }
      chosen = picked.lot
    } else if (
      resolution.lot &&
      remainingQty(resolution.lot.qty_purchased, resolution.lot.qty_assigned) > 0
    ) {
      chosen = resolution.lot
    }

    const assignedDate = opts.assignedDate || ymdInTimeZone(new Date())
    const office = opts.chargeOffice?.trim() || UNSPECIFIED_OFFICE

    const inserted = await insertAllocation(supabase, {
      deviceId: opts.device.id,
      lot: chosen,
      office,
      assignedDate,
      actor: opts.actor,
    })
    if (inserted.skipped) {
      return {
        consumed: false,
        unmatched: false,
        skipped: inserted.skipped,
        prompt: promptFromResolution(resolution, existing?.id || null, chosen?.id || null),
      }
    }
    if (chosen) {
      await supabase
        .from('devices')
        .update({ not_from_stock: false, stock_lot_id: chosen.id })
        .eq('id', opts.device.id)
    }
    return {
      consumed: Boolean(chosen),
      unmatched: !chosen,
      prompt: promptFromResolution(resolution, inserted.id, chosen?.id || null),
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('maybeConsumeStockLot failed:', message)
    return { consumed: false, unmatched: false, skipped: 'error' }
  }
}

/** Charge remaining accessory lots (SSD/RAM/Other) to an office without a device. */
export async function chargeLotToOffice(
  supabase: QueryClient,
  opts: {
    lotId: string
    office: string
    quantity?: number
    actor?: string | null
    assignedDate?: string
  }
): Promise<{ id: string | null; skipped?: string }> {
  const lots = await fetchLotsWithMetrics(supabase)
  const lot = lots.find((row) => row.id === opts.lotId) || null
  if (!lot) return { id: null, skipped: 'lot-not-found' }
  const quantity = Math.floor(Number(opts.quantity ?? 1))
  if (!Number.isFinite(quantity) || quantity < 1) return { id: null, skipped: 'invalid-qty' }
  if (remainingQty(lot.qty_purchased, lot.qty_assigned) < quantity) {
    return { id: null, skipped: 'lot-empty' }
  }
  return insertAllocation(supabase, {
    deviceId: null,
    lot,
    office: opts.office,
    assignedDate: opts.assignedDate || ymdInTimeZone(new Date()),
    actor: opts.actor,
    quantity,
    source: 'manual',
  })
}

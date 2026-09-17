import { officeNameToLocation } from '@/lib/devices'

export const STOCK_ASSET_TYPES = [
  'laptop',
  'desktop',
  'server',
  'ssd',
  'ram',
  'monitor',
  'other',
] as const
export type StockAssetType = (typeof STOCK_ASSET_TYPES)[number]

/** Accessory lots charged to an office from Stock — they are not devices. */
export const MANUAL_LOT_CHARGE_TYPES: StockAssetType[] = ['ssd', 'ram', 'other']

export function isManualLotChargeType(value: string | null | undefined): boolean {
  return MANUAL_LOT_CHARGE_TYPES.includes(value as StockAssetType)
}

export const STOCK_REPORT_TZ = 'America/New_York'
export const UNSPECIFIED_OFFICE = 'Unspecified'
export const CHARGE_OFFICE_REQUIRED = 'Pick which office to charge'

export interface PurchaseLot {
  id: string
  item_id: string
  purchase_date: string
  vendor: string | null
  item_description: string | null
  qty_purchased: number
  unit_cost: number
  asset_type: StockAssetType
  manufacturer: string | null
  model: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface StockAllocation {
  id: string
  lot_id: string | null
  device_id: string | null
  assigned_date: string
  office: string
  quantity: number
  unit_cost: number | null
  allocated_cost: number | null
  source: 'auto' | 'manual'
  created_by: string | null
  created_at: string
}

export interface LotWithMetrics extends PurchaseLot {
  qty_assigned: number
  qty_in_stock: number
  total_purchase_cost: number
  stock_value: number
  last_assigned_date?: string | null
}

export type ReportAllocationRow = StockAllocation & {
  item_id: string
  serial_number?: string | null
  user_name?: string | null
  purchase_date?: string | null
  manufacturer?: string | null
  model?: string | null
}

export interface MonthEndGroup {
  key: string
  assigned_date: string
  item_id: string
  office: string
  quantity: number
  unit_cost: number | null
  allocated_cost: number
  unmatched: boolean
  purchase_date: string | null
  manufacturer: string | null
  model: string | null
  rows: ReportAllocationRow[]
}

export function isStockAssetType(value: string | null | undefined): value is StockAssetType {
  return STOCK_ASSET_TYPES.includes(value as StockAssetType)
}

function isRemoteOfficeName(value: string): boolean {
  return value.toLowerCase() === 'remote'
}

/** Settings offices as report locations, minus Remote. Orlando/Sarasota → Florida. */
export function chargeOfficeOptions(officeNames: Array<string | null | undefined>): string[] {
  const set = new Set<string>()
  for (const raw of officeNames) {
    const loc = officeNameToLocation(String(raw || '').trim())
    if (!loc || isRemoteOfficeName(loc)) continue
    set.add(loc)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function parseChargeOfficeInput(body: Record<string, unknown> | null | undefined): string | null {
  if (!body) return null
  const raw = body.charge_office ?? body.office
  if (raw == null) return null
  const s = String(raw).trim()
  return s.length > 0 ? s : null
}

export function assertChargeOffice(
  value: unknown,
  allowed: string[]
): { ok: true; office: string } | { ok: false; error: string } {
  const raw = String(value ?? '').trim()
  if (!raw) return { ok: false, error: CHARGE_OFFICE_REQUIRED }
  const loc = officeNameToLocation(raw)
  if (!loc || isRemoteOfficeName(loc) || isRemoteOfficeName(raw)) {
    return { ok: false, error: 'Remote is not a chargeable office' }
  }
  const match = allowed.find((office) => office === loc || office === raw)
  if (!match) return { ok: false, error: CHARGE_OFFICE_REQUIRED }
  return { ok: true, office: match }
}

export function consumeSkipError(skipped?: string | null): string | null {
  if (skipped === 'charge-office-required') return CHARGE_OFFICE_REQUIRED
  if (skipped === 'lot-not-found') return 'Purchase lot not found'
  if (skipped === 'lot-empty') return 'That purchase lot has no remaining quantity'
  if (skipped === 'invalid-qty') return 'Quantity must be at least 1 and not more than remaining stock'
  // lot-tagged: saved stock_lot_id without consuming; not an error
  return null
}

/** Charge to is only required when the PC is assigned to a person. */
export function requiresChargeOffice(nextEmployeeId: string | null | undefined): boolean {
  return Boolean(String(nextEmployeeId || '').trim())
}

export function resolveTaggedLotId(opts: {
  lotId?: string | null
  stockLotId?: string | null
}): string | null {
  const explicit = String(opts.lotId || '').trim()
  if (explicit) return explicit
  const saved = String(opts.stockLotId || '').trim()
  return saved || null
}

export function moneyNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function formatUsd(value: unknown): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    moneyNumber(value)
  )
}

export function computeLotMetrics(
  qtyPurchased: number,
  unitCost: number,
  qtyAssigned: number
): {
  total_purchase_cost: number
  qty_in_stock: number
  stock_value: number
} {
  const assigned = Math.max(0, qtyAssigned)
  const inStock = qtyPurchased - assigned
  return {
    total_purchase_cost: roundMoney(qtyPurchased * unitCost),
    qty_in_stock: inStock,
    stock_value: roundMoney(inStock * unitCost),
  }
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function remainingQty(qtyPurchased: number, qtyAssigned: number): number {
  return qtyPurchased - qtyAssigned
}

/**
 * Tracker keeps depleted lots through the Eastern month they emptied.
 * After that month they stay in the database for reports but leave `/stock`.
 */
export function isLotVisibleOnTracker(
  lot: { qty_in_stock: number; last_assigned_date?: string | null },
  asOf: Date = new Date()
): boolean {
  if (lot.qty_in_stock > 0) return true
  const last = lot.last_assigned_date
  if (!last || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return false
  return monthKeyFromYmd(last) === monthKeyFromYmd(ymdInTimeZone(asOf))
}

export function assertCanAllocate(
  remaining: number,
  quantity: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: 'Quantity must be a positive integer' }
  }
  if (quantity > remaining) {
    return { ok: false, error: `Only ${remaining} remaining in this lot` }
  }
  return { ok: true }
}

export function assertQtyPurchased(
  qtyPurchased: number,
  qtyAssigned: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(qtyPurchased) || qtyPurchased < 1) {
    return { ok: false, error: 'Qty purchased must be a positive integer' }
  }
  if (qtyPurchased < qtyAssigned) {
    return { ok: false, error: `Qty purchased cannot be below ${qtyAssigned} already assigned` }
  }
  return { ok: true }
}

export function normalizeMatch(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

export function lotMatchesDevice(
  lot: Pick<PurchaseLot, 'asset_type' | 'manufacturer' | 'model'>,
  device: { asset_type?: string | null; manufacturer?: string | null; model?: string | null }
): boolean {
  if (lot.asset_type !== device.asset_type) return false
  const lotMfr = normalizeMatch(lot.manufacturer)
  if (lotMfr && lotMfr !== normalizeMatch(device.manufacturer)) return false
  const lotModel = normalizeMatch(lot.model)
  if (lotModel && lotModel !== normalizeMatch(device.model)) return false
  return true
}

export function pickFifoLot<T extends PurchaseLot & { qty_in_stock: number }>(
  lots: T[],
  device: { asset_type?: string | null; manufacturer?: string | null; model?: string | null }
): T | null {
  return resolveStockLot(lots, device).lot
}

export function formatMakeModel(
  manufacturer?: string | null,
  model?: string | null
): string {
  const make = String(manufacturer ?? '').trim()
  const mod = String(model ?? '').trim()
  if (!make) return mod
  if (!mod) return make
  return mod.toLowerCase().startsWith(make.toLowerCase()) ? mod : `${make} ${mod}`
}

export function assertLotMakeModel(
  manufacturer: unknown,
  model: unknown
): { ok: true; manufacturer: string; model: string } | { ok: false; error: string } {
  const mfr = String(manufacturer ?? '').trim()
  const mod = String(model ?? '').trim()
  if (!mfr) return { ok: false, error: 'Manufacturer is required' }
  if (!mod) return { ok: false, error: 'Model is required' }
  return { ok: true, manufacturer: mfr, model: mod }
}

/** Dropdown label: item id, purchase date, make/model, remaining qty, unit cost. */
export function formatLotOptionLabel(lot: {
  item_id: string
  purchase_date?: string | null
  qty_in_stock: number
  manufacturer?: string | null
  model?: string | null
  unit_cost?: number | null
}): string {
  const hw = formatMakeModel(lot.manufacturer, lot.model)
  const date = String(lot.purchase_date ?? '').trim()
  const cost = lot.unit_cost == null ? '' : ` · ${formatUsd(lot.unit_cost)}`
  const parts = [lot.item_id, date || null, hw || null, `${lot.qty_in_stock} left`].filter(Boolean)
  return `${parts.join(' · ')}${cost}`
}

/** Make/model from Ninja or inventory — enough to auto-pick a lot. */
export function hasHardwareIdentity(device: {
  manufacturer?: string | null
  model?: string | null
}): boolean {
  return Boolean(normalizeMatch(device.manufacturer) || normalizeMatch(device.model))
}

export function sortLotsFifo<T extends PurchaseLot>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const dateCmp = a.purchase_date.localeCompare(b.purchase_date)
    if (dateCmp !== 0) return dateCmp
    return a.created_at.localeCompare(b.created_at)
  })
}

export function candidateLotsForPrompt<T extends PurchaseLot & { qty_in_stock: number }>(
  lots: T[],
  _device?: { asset_type?: string | null; manufacturer?: string | null; model?: string | null }
): T[] {
  return sortLotsFifo(lots.filter((lot) => lot.qty_in_stock > 0))
}

export type StockLotResolution<T extends PurchaseLot & { qty_in_stock: number } = LotWithMetrics> = {
  /** FIFO found a matching open lot to pre-select. The UI still confirms. */
  determined: boolean
  status: 'unique' | 'none' | 'ambiguous'
  lot: T | null
  matches: T[]
}

/**
 * Oldest matching open lot is the default (FIFO). The dropdown lists every
 * open lot so Destiny can override the suspected match.
 */
export function resolveStockLot<T extends PurchaseLot & { qty_in_stock: number }>(
  lots: T[],
  device: { asset_type?: string | null; manufacturer?: string | null; model?: string | null }
): StockLotResolution<T> {
  const dropdown = candidateLotsForPrompt(lots, device)
  const exact = sortLotsFifo(
    lots.filter((lot) => lot.qty_in_stock > 0 && lotMatchesDevice(lot, device))
  )
  if (exact.length >= 1) {
    return {
      determined: true,
      status: exact.length === 1 ? 'unique' : 'ambiguous',
      lot: exact[0],
      matches: dropdown.length > 0 ? dropdown : exact,
    }
  }
  if (dropdown.length === 0) {
    return { determined: false, status: 'none', lot: null, matches: [] }
  }
  return { determined: false, status: 'none', lot: null, matches: dropdown }
}

export function shouldConsumeStock(opts: {
  assetType: string | null | undefined
  isLoaner: boolean
  previousStatus: string | null | undefined
  previousEmployeeId: string | null | undefined
  nextEmployeeId: string | null | undefined
  alreadyAllocated: boolean
  /** Onboarding created a PC already assigned — still charge a lot. */
  force?: boolean
}): boolean {
  if (opts.alreadyAllocated) return false
  if (opts.isLoaner) return false
  if (!isStockAssetType(opts.assetType ?? null)) return false
  if (!opts.nextEmployeeId) return false
  if (opts.force) return true
  if (opts.previousEmployeeId) return false
  return true
}

export function ymdInTimeZone(date: Date, timeZone: string = STOCK_REPORT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

export function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7)
}

export function trailingMonthKeys(asOf: Date, count: number = 12): string[] {
  const ymd = ymdInTimeZone(asOf)
  return monthKeysFromThrough(shiftMonthKey(monthKeyFromYmd(ymd), -(count - 1)), monthKeyFromYmd(ymd))
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Month must be YYYY-MM')
  }
  const [y, m] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Inclusive YYYY-MM keys from `fromMonthKey` through `toMonthKey`, newest first. */
export function monthKeysFromThrough(fromMonthKey: string, toMonthKey: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(fromMonthKey) || !/^\d{4}-\d{2}$/.test(toMonthKey)) {
    throw new Error('Month must be YYYY-MM')
  }
  if (fromMonthKey > toMonthKey) return []
  const keys: string[] = []
  let [y, m] = toMonthKey.split('-').map(Number)
  const [fy, fm] = fromMonthKey.split('-').map(Number)
  while (y > fy || (y === fy && m >= fm)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return keys
}

export function isMonthInWindow(monthKey: string, asOf: Date = new Date()): boolean {
  return trailingMonthKeys(asOf).includes(monthKey)
}

export function monthBounds(monthKey: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Month must be YYYY-MM')
  }
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function yearsFromMonthKeys(monthKeys: string[]): number[] {
  const years = new Set<number>()
  for (const key of monthKeys) {
    const y = Number(key.slice(0, 4))
    if (Number.isFinite(y)) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

export function groupMonthEndRows(rows: ReportAllocationRow[]): MonthEndGroup[] {
  const map = new Map<string, MonthEndGroup>()
  for (const row of rows) {
    const itemId = row.item_id || 'Unmatched'
    const office = row.office || UNSPECIFIED_OFFICE
    const lotKey = row.lot_id || 'unmatched'
    const key = `${row.assigned_date}|${lotKey}|${office}`
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        assigned_date: row.assigned_date,
        item_id: itemId,
        office,
        quantity: 0,
        unit_cost: row.unit_cost,
        allocated_cost: 0,
        unmatched: !row.lot_id,
        purchase_date: row.purchase_date || null,
        manufacturer: row.manufacturer || null,
        model: row.model || null,
        rows: [],
      }
      map.set(key, group)
    }
    group.quantity += row.quantity
    group.allocated_cost = roundMoney(group.allocated_cost + moneyNumber(row.allocated_cost))
    if (group.unit_cost == null) group.unit_cost = row.unit_cost
    else if (row.unit_cost != null && group.unit_cost !== row.unit_cost) group.unit_cost = null
    group.unmatched = group.unmatched || !row.lot_id
    group.rows.push(row)
  }
  return [...map.values()].sort((a, b) => {
    const dateCmp = a.assigned_date.localeCompare(b.assigned_date)
    if (dateCmp !== 0) return dateCmp
    const lotDateCmp = (a.purchase_date || '').localeCompare(b.purchase_date || '')
    if (lotDateCmp !== 0) return lotDateCmp
    const itemCmp = a.item_id.localeCompare(b.item_id)
    if (itemCmp !== 0) return itemCmp
    return a.office.localeCompare(b.office)
  })
}

export function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export const REPORT_MAX_SPAN_MONTHS = 24

export type ReportPeriodMode = 'month' | 'month_to_month' | 'yearly'

export function parseReportYmd(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

/** Inclusive calendar months covered by a YYYY-MM-DD range. */
export function ymdSpanMonths(start: string, end: string): number {
  const [sy, sm] = start.slice(0, 7).split('-').map(Number)
  const [ey, em] = end.slice(0, 7).split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}

export function rangeSpansMultipleMonths(start: string, end: string): boolean {
  return monthKeyFromYmd(start) !== monthKeyFromYmd(end)
}

export function assertReportRange(
  start: string,
  end: string
): { ok: true } | { ok: false; error: string } {
  if (!parseReportYmd(start) || !parseReportYmd(end)) {
    return { ok: false, error: 'Dates must be YYYY-MM-DD' }
  }
  if (start > end) {
    return { ok: false, error: 'Start date must be on or before end date' }
  }
  if (ymdSpanMonths(start, end) > REPORT_MAX_SPAN_MONTHS) {
    return { ok: false, error: `Range cannot exceed ${REPORT_MAX_SPAN_MONTHS} months` }
  }
  return { ok: true }
}

export function periodBounds(
  mode: ReportPeriodMode,
  opts: { month?: string; startMonth?: string; endMonth?: string; year?: number },
  asOf: Date = new Date()
): { start: string; end: string } {
  if (mode === 'month') {
    if (!opts.month) throw new Error('Month is required')
    return monthBounds(opts.month)
  }
  if (mode === 'month_to_month') {
    if (!opts.startMonth || !opts.endMonth) {
      throw new Error('Start and end months are required')
    }
    const start = monthBounds(opts.startMonth).start
    const end = monthBounds(opts.endMonth).end
    if (start > end) throw new Error('Start month must be on or before end month')
    return { start, end }
  }
  if (mode === 'yearly') {
    const year = opts.year
    if (!year || !Number.isInteger(year)) throw new Error('Year is required')
    return { start: `${year}-01-01`, end: `${year}-12-31` }
  }
  throw new Error('Unknown period mode')
}

export function periodLabel(
  mode: ReportPeriodMode,
  opts: { month?: string; startMonth?: string; endMonth?: string; year?: number },
  asOf: Date = new Date()
): string {
  if (mode === 'month') {
    if (!opts.month) return 'Month'
    return monthLabel(opts.month)
  }
  if (mode === 'month_to_month') {
    if (!opts.startMonth || !opts.endMonth) return 'Month to month'
    const [sy, sm] = opts.startMonth.split('-').map(Number)
    const [ey, em] = opts.endMonth.split('-').map(Number)
    const startName = new Date(sy, sm - 1, 1).toLocaleString('en-US', { month: 'long' })
    const endName = new Date(ey, em - 1, 1).toLocaleString('en-US', { month: 'long' })
    if (sy === ey) return `${startName}–${endName} ${sy}`
    return `${monthLabel(opts.startMonth)} – ${monthLabel(opts.endMonth)}`
  }
  if (mode === 'yearly') {
    return opts.year != null ? String(opts.year) : 'Year'
  }
  return 'Report'
}

export function reportYearOptions(dataYears: number[], asOf: Date = new Date()): number[] {
  const current = Number(ymdInTimeZone(asOf).slice(0, 4))
  const years = new Set(dataYears.filter((y) => Number.isFinite(y)))
  years.add(current)
  return [...years].sort((a, b) => b - a)
}

export function reportTotals(groups: MonthEndGroup[]): { quantity: number; allocated_cost: number } {
  return groups.reduce(
    (acc, g) => ({
      quantity: acc.quantity + g.quantity,
      allocated_cost: roundMoney(acc.allocated_cost + g.allocated_cost),
    }),
    { quantity: 0, allocated_cost: 0 }
  )
}

/** The calendar month that just closed in America/New_York (what month-end email sends). */
export function completedMonthKey(asOf: Date = new Date()): string {
  return shiftMonthKey(monthKeyFromYmd(ymdInTimeZone(asOf)), -1)
}

export function officeReportTotals(
  groups: MonthEndGroup[]
): Array<{ office: string; quantity: number; allocated_cost: number }> {
  const byOffice = new Map<string, { office: string; quantity: number; allocated_cost: number }>()
  for (const g of groups) {
    const office = g.office || UNSPECIFIED_OFFICE
    const cur = byOffice.get(office) || { office, quantity: 0, allocated_cost: 0 }
    cur.quantity += g.quantity
    cur.allocated_cost = roundMoney(cur.allocated_cost + g.allocated_cost)
    byOffice.set(office, cur)
  }
  return [...byOffice.values()].sort((a, b) => a.office.localeCompare(b.office))
}

export function reportCsvFilename(start: string, end: string): string {
  const startMonth = monthKeyFromYmd(start)
  const endMonth = monthKeyFromYmd(end)
  if (startMonth === endMonth && start === monthBounds(startMonth).start && end === monthBounds(endMonth).end) {
    return `stock-report-${startMonth}.csv`
  }
  if (start.endsWith('-01-01') && end.endsWith('-12-31') && start.slice(0, 4) === end.slice(0, 4)) {
    return `stock-report-${start.slice(0, 4)}.csv`
  }
  return `stock-report-${start}-to-${end}.csv`
}

export function monthEndCsv(
  groups: MonthEndGroup[],
  opts?: { includeMonthColumn?: boolean }
): string {
  const includeMonth = Boolean(opts?.includeMonthColumn)
  const header = [
    ...(includeMonth ? ['Month'] : []),
    'Date assigned',
    'Item ID',
    'Lot purchased',
    'Office',
    'Quantity',
    'Unit cost',
    'Allocated cost',
  ]
  const lines = [header.join(',')]
  for (const g of groups) {
    lines.push(
      [
        ...(includeMonth ? [csvEscape(monthKeyFromYmd(g.assigned_date))] : []),
        csvEscape(g.assigned_date),
        csvEscape(g.item_id),
        csvEscape(g.purchase_date || ''),
        csvEscape(g.office),
        csvEscape(g.quantity),
        csvEscape(g.unit_cost ?? ''),
        csvEscape(g.allocated_cost),
      ].join(',')
    )
  }
  return lines.join('\r\n') + '\r\n'
}

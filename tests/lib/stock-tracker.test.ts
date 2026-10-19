import { describe, it, expect } from 'vitest'
import {
  canRemoveAdmin,
  canAccessStockTracker,
  isAccountingAllowedPath,
  isAccountingOnly,
  isSeedAdmin,
  normalizeEmail,
} from '@/lib/roles'
import {
  assertCanAllocate,
  assertQtyPurchased,
  chargedUnitCost,
  computeLotMetrics,
  parseTotalPurchaseCost,
  csvEscape,
  groupMonthEndRows,
  allocationReportDate,
  isMonthInWindow,
  lotMatchesDevice,
  monthBounds,
  monthEndCsv,
  pickFifoLot,
  remainingQty,
  isLotVisibleOnTracker,
  resolveStockLot,
  formatLotOptionLabel,
  shouldConsumeStock,
  isStockAssetType,
  STOCK_ASSET_TYPES,
  trailingMonthKeys,
  yearsFromMonthKeys,
  periodBounds,
  periodLabel,
  assertReportRange,
  reportYearOptions,
  reportTotals,
  reportCsvFilename,
  REPORT_MAX_SPAN_MONTHS,
  chargeOfficeOptions,
  assertChargeOffice,
  parseChargeOfficeInput,
  consumeSkipError,
  CHARGE_OFFICE_REQUIRED,
  completedMonthKey,
  officeReportTotals,
  candidateLotsForPrompt,
  assertLotMakeModel,
  requiresChargeOffice,
  resolveTaggedLotId,
  type ReportAllocationRow,
} from '@/lib/stock-tracker'
import { enrichLots, shouldSkipStockBecauseNotFromStock } from '@/lib/stock-consume'
import {
  resolveReportEmailRange,
  stockReportEmailHtml,
} from '@/lib/stock-report-email'

describe('roles helpers', () => {
  it('normalizes email case and whitespace', () => {
    expect(normalizeEmail('  DSimmons@Bennett-Pless.com ')).toBe('dsimmons@bennett-pless.com')
  })

  it('recognizes seed admins', () => {
    expect(isSeedAdmin('dsimmons@bennett-pless.com')).toBe(true)
    expect(isSeedAdmin('accounting@bennett-pless.com')).toBe(false)
  })

  it('blocks removing the last admin', () => {
    expect(canRemoveAdmin('a@x.com', ['a@x.com']).ok).toBe(false)
    expect(canRemoveAdmin('a@x.com', ['a@x.com', 'b@x.com']).ok).toBe(true)
  })

  it('allows accounting onto stock paths only', () => {
    expect(isAccountingAllowedPath('/stock')).toBe(true)
    expect(isAccountingAllowedPath('/stock/reports')).toBe(true)
    expect(isAccountingAllowedPath('/api/stock/lots')).toBe(true)
    expect(isAccountingAllowedPath('/api/network/offices')).toBe(true)
    expect(isAccountingAllowedPath('/employees')).toBe(false)
    expect(isAccountingAllowedPath('/api/devices')).toBe(false)
    expect(isAccountingAllowedPath('/settings')).toBe(false)
  })

  it('treats only accounting as accounting-only (dev bypass is admin)', () => {
    expect(isAccountingOnly('accounting')).toBe(true)
    expect(isAccountingOnly('admin')).toBe(false)
  })

  it('does not grant EMS app access to accounting', () => {
    expect(canAccessStockTracker('admin')).toBe(true)
    expect(canAccessStockTracker('accounting')).toBe(false)
  })
})

describe('lot math', () => {
  it('computes purchase cost, remaining qty, and stock value from the entered total', () => {
    expect(computeLotMetrics(7, 7000, 0)).toEqual({
      total_purchase_cost: 7000,
      qty_in_stock: 7,
      stock_value: 7000,
    })
    expect(computeLotMetrics(7, 7000, 3)).toEqual({
      total_purchase_cost: 7000,
      qty_in_stock: 4,
      stock_value: 4000,
    })
  })

  it('applies tax by using the entered total instead of qty times unit cost', () => {
    expect(computeLotMetrics(3, 330, 1)).toEqual({
      total_purchase_cost: 330,
      qty_in_stock: 2,
      stock_value: 220,
    })
    expect(computeLotMetrics(3, 100, 1)).toEqual({
      total_purchase_cost: 100,
      qty_in_stock: 2,
      stock_value: 66.67,
    })
    expect(chargedUnitCost({ qty_purchased: 3, unit_cost: 100, total_purchase_cost: 330 })).toBe(110)
    expect(chargedUnitCost({ qty_purchased: 3, unit_cost: 100 })).toBe(100)
    expect(parseTotalPurchaseCost('')).toEqual({
      ok: false,
      error: 'Total purchase cost is required',
    })
    expect(parseTotalPurchaseCost(-1)).toEqual({
      ok: false,
      error: 'Total purchase cost cannot be negative',
    })
    expect(parseTotalPurchaseCost('330.00')).toEqual({ ok: true, total: 330 })
  })

  it('rejects over-allocation and qty below already assigned', () => {
    expect(assertCanAllocate(4, 5).ok).toBe(false)
    expect(assertCanAllocate(4, 2).ok).toBe(true)
    expect(assertQtyPurchased(2, 3).ok).toBe(false)
    expect(assertQtyPurchased(3, 3).ok).toBe(true)
  })

  it('keeps depleted lots on the tracker through the month they emptied', () => {
    const asOf = new Date('2026-09-15T18:00:00Z')
    expect(isLotVisibleOnTracker({ qty_in_stock: 4 }, asOf)).toBe(true)
    expect(
      isLotVisibleOnTracker({ qty_in_stock: 0, last_assigned_date: '2026-09-09' }, asOf)
    ).toBe(true)
    expect(
      isLotVisibleOnTracker({ qty_in_stock: 0, last_assigned_date: '2026-08-31' }, asOf)
    ).toBe(false)
    expect(isLotVisibleOnTracker({ qty_in_stock: 0, last_assigned_date: null }, asOf)).toBe(false)
  })
})

describe('FIFO lot default', () => {
  const eligible = {
    assetType: 'laptop' as const,
    isLoaner: false,
    previousStatus: 'in_stock',
    previousEmployeeId: null as string | null,
    nextEmployeeId: 'emp-1',
    alreadyAllocated: false,
  }

  it('consumes a laptop leaving in_stock for an employee', () => {
    expect(shouldConsumeStock(eligible)).toBe(true)
  })

  it('does not consume loaners, transfers, unassign, or second assign', () => {
    expect(shouldConsumeStock({ ...eligible, isLoaner: true })).toBe(false)
    expect(shouldConsumeStock({ ...eligible, previousEmployeeId: 'emp-0' })).toBe(false)
    expect(shouldConsumeStock({ ...eligible, nextEmployeeId: null })).toBe(false)
    expect(shouldConsumeStock({ ...eligible, alreadyAllocated: true })).toBe(false)
    expect(shouldConsumeStock({ ...eligible, previousStatus: 'active' })).toBe(true)
    expect(shouldConsumeStock({ ...eligible, assetType: 'tv' })).toBe(false)
    expect(shouldConsumeStock({ ...eligible, assetType: 'printer' })).toBe(false)
  })

  it('consumes monitors, servers, and other stock lot types on first assign', () => {
    expect(shouldConsumeStock({ ...eligible, assetType: 'monitor' })).toBe(true)
    expect(shouldConsumeStock({ ...eligible, assetType: 'server' })).toBe(true)
    expect(shouldConsumeStock({ ...eligible, assetType: 'ssd' })).toBe(true)
    expect(shouldConsumeStock({ ...eligible, assetType: 'ram' })).toBe(true)
    expect(shouldConsumeStock({ ...eligible, assetType: 'other' })).toBe(true)
  })

  it('treats laptop, desktop, server, ssd, ram, monitor, and other as stock lot types', () => {
    expect(STOCK_ASSET_TYPES).toEqual([
      'laptop',
      'desktop',
      'server',
      'ssd',
      'ram',
      'monitor',
      'other',
    ])
    expect(isStockAssetType('monitor')).toBe(true)
    expect(isStockAssetType('tv')).toBe(false)
    expect(isStockAssetType('printer')).toBe(false)
  })

  it('force-consumes an onboarding create that was never in_stock', () => {
    expect(
      shouldConsumeStock({
        ...eligible,
        previousStatus: 'active',
        force: true,
      })
    ).toBe(true)
  })

  it('auto-picks the remaining matching lot after an older lot is exhausted', () => {
    const lots = enrichLots(
      [
        {
          id: 'new',
          item_id: 'B Dell',
          cpa_number: null,
          purchase_date: '2026-10-01',
          vendor: null,
          item_description: null,
          qty_purchased: 5,
          unit_cost: 1000,
          asset_type: 'laptop',
          manufacturer: 'Dell',
          model: 'Latitude 5550',
          created_by: null,
          updated_by: null,
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'old',
          item_id: 'A Dell',
          cpa_number: null,
          purchase_date: '2026-09-15',
          vendor: 'MicroAge',
          item_description: 'Dell Latitude 5550 laptop',
          qty_purchased: 7,
          unit_cost: 1000,
          asset_type: 'laptop',
          manufacturer: 'Dell',
          model: 'Latitude 5550',
          created_by: null,
          updated_by: null,
          created_at: '2026-09-15T00:00:00.000Z',
          updated_at: '2026-09-15T00:00:00.000Z',
        },
      ],
      [{ lot_id: 'old', quantity: 7 }]
    )
    const picked = pickFifoLot(lots, {
      asset_type: 'laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
    })
    expect(picked?.id).toBe('new')
    expect(remainingQty(picked!.qty_purchased, picked!.qty_assigned)).toBe(5)
  })

  it('FIFO-picks the oldest matching open lot and lists every open lot', () => {
    const lots = enrichLots(
      [
        {
          id: 'dell',
          item_id: 'A Dell',
          cpa_number: null,
          purchase_date: '2026-09-15',
          vendor: null,
          item_description: null,
          qty_purchased: 7,
          unit_cost: 1000,
          asset_type: 'laptop',
          manufacturer: 'Dell',
          model: 'Latitude 5550',
          created_by: null,
          updated_by: null,
          created_at: '2026-09-15T00:00:00.000Z',
          updated_at: '2026-09-15T00:00:00.000Z',
        },
        {
          id: 'hp',
          item_id: 'B HP',
          cpa_number: null,
          purchase_date: '2026-09-20',
          vendor: null,
          item_description: null,
          qty_purchased: 3,
          unit_cost: 900,
          asset_type: 'laptop',
          manufacturer: 'HP',
          model: 'EliteBook',
          created_by: null,
          updated_by: null,
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
        },
      ],
      []
    )
    const determined = resolveStockLot(lots, {
      asset_type: 'laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
    })
    expect(determined.determined).toBe(true)
    expect(determined.lot?.id).toBe('dell')
    expect(determined.matches.map((l) => l.id)).toEqual(['dell', 'hp'])

    const twoDell = enrichLots(
      [
        lots[0],
        {
          ...lots[0],
          id: 'dell-newer',
          item_id: 'C Dell',
          purchase_date: '2026-10-01',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        },
      ],
      []
    )
    const fifo = resolveStockLot(twoDell, {
      asset_type: 'laptop',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
    })
    expect(fifo.determined).toBe(true)
    expect(fifo.lot?.id).toBe('dell')
    expect(fifo.matches.map((l) => l.id)).toEqual(['dell', 'dell-newer'])

    const noNinja = resolveStockLot(lots, {
      asset_type: 'laptop',
      manufacturer: null,
      model: null,
    })
    expect(noNinja.determined).toBe(false)
    expect(noNinja.matches.length).toBe(2)
    expect(candidateLotsForPrompt(lots, { asset_type: 'laptop', manufacturer: 'Dell', model: 'Latitude 5550' }).map((l) => l.id)).toEqual(
      ['dell', 'hp']
    )
  })

  it('does not match a lot when manufacturer is set and differs', () => {
    expect(
      lotMatchesDevice(
        { asset_type: 'laptop', manufacturer: 'HP', model: null },
        { asset_type: 'laptop', manufacturer: 'Dell', model: 'X' }
      )
    ).toBe(false)
  })

  it('labels lots with item id, purchase date, make/model, remaining qty, and unit cost', () => {
    expect(
      formatLotOptionLabel({
        item_id: 'A Dell',
        purchase_date: '2026-08-04',
        qty_in_stock: 4,
        manufacturer: 'Dell',
        model: 'Latitude 5550',
        unit_cost: 1000,
      })
    ).toBe('A Dell · 2026-08-04 · Dell Latitude 5550 · 4 left · $1,000.00')
  })

  it('requires manufacturer and model on lots', () => {
    expect(assertLotMakeModel('', 'Latitude').ok).toBe(false)
    expect(assertLotMakeModel('Dell', '  ').ok).toBe(false)
    expect(assertLotMakeModel('Dell', 'Latitude 5550')).toEqual({
      ok: true,
      manufacturer: 'Dell',
      model: 'Latitude 5550',
    })
  })

  it('builds charge-to offices from Settings names, grouping Florida and dropping Remote', () => {
    expect(
      chargeOfficeOptions([
        'Charlotte Office',
        'Remote',
        'Orlando',
        'Sarasota Office',
        'Nashville Office',
        'remote',
      ])
    ).toEqual(['Charlotte', 'Florida', 'Nashville'])
  })

  it('requires a charge office from the allowed list and rejects Remote', () => {
    const allowed = chargeOfficeOptions(['Charlotte Office', 'Orlando', 'Remote'])
    expect(assertChargeOffice('', allowed).ok).toBe(false)
    expect(assertChargeOffice('Remote', allowed)).toEqual({
      ok: false,
      error: 'Remote is not a chargeable office',
    })
    expect(assertChargeOffice('Charlotte Office', allowed)).toEqual({
      ok: true,
      office: 'Charlotte',
    })
    expect(parseChargeOfficeInput({ charge_office: 'Florida' })).toBe('Florida')
    expect(parseChargeOfficeInput({ office: '  ' })).toBeNull()
    expect(consumeSkipError('charge-office-required')).toBe(CHARGE_OFFICE_REQUIRED)
    expect(consumeSkipError('lot-tagged')).toBeNull()
  })

  it('does not require Charge to until a person is assigned', () => {
    expect(requiresChargeOffice(null)).toBe(false)
    expect(requiresChargeOffice('')).toBe(false)
    expect(requiresChargeOffice('emp-1')).toBe(true)
    expect(resolveTaggedLotId({ lotId: null, stockLotId: 'saved-lot' })).toBe('saved-lot')
    expect(resolveTaggedLotId({ lotId: 'picked-lot', stockLotId: 'saved-lot' })).toBe('picked-lot')
    expect(resolveTaggedLotId({ lotId: '  ', stockLotId: null })).toBeNull()
    expect(
      shouldConsumeStock({
        assetType: 'laptop',
        isLoaner: false,
        previousStatus: 'in_stock',
        previousEmployeeId: null,
        nextEmployeeId: null,
        alreadyAllocated: false,
        force: true,
      })
    ).toBe(false)
    expect(
      shouldConsumeStock({
        assetType: 'laptop',
        isLoaner: false,
        previousStatus: 'in_stock',
        previousEmployeeId: null,
        nextEmployeeId: 'emp-1',
        alreadyAllocated: false,
        force: true,
      })
    ).toBe(true)
  })
})

describe('month-end report', () => {
  function alloc(
    partial: Partial<ReportAllocationRow> &
      Pick<ReportAllocationRow, 'id' | 'lot_id' | 'assigned_date' | 'office' | 'item_id'>
  ): ReportAllocationRow {
    return {
      device_id: null,
      quantity: 1,
      unit_cost: 1000,
      allocated_cost: 1000,
      source: 'auto',
      created_by: null,
      created_at: '',
      purchase_date: '2026-09-15',
      manufacturer: 'Dell',
      model: 'Latitude 5550',
      cpa_number: null,
      ...partial,
    }
  }

  it('merges two units from the same lot on the same day and office', () => {
    const groups = groupMonthEndRows([
      alloc({
        id: '1',
        lot_id: 'lot-a',
        device_id: 'd1',
        assigned_date: '2026-10-01',
        office: 'Florida',
        item_id: '010101 Dell Latitude',
        cpa_number: 'CPA-9',
        serial_number: 'AAA',
        user_name: 'Ann',
      }),
      alloc({
        id: '2',
        lot_id: 'lot-a',
        device_id: 'd2',
        assigned_date: '2026-10-01',
        office: 'Florida',
        item_id: '010101 Dell Latitude',
        serial_number: 'BBB',
        user_name: 'Bob',
      }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].quantity).toBe(2)
    expect(groups[0].allocated_cost).toBe(2000)
    expect(groups[0].office).toBe('Florida')
    expect(groups[0].purchase_date).toBe('2026-09-15')
    expect(groups[0].cpa_number).toBe('CPA-9')
  })

  it('splits the same make/model when they come from two lots on the same day', () => {
    const groups = groupMonthEndRows([
      alloc({
        id: '1',
        lot_id: 'lot-a',
        assigned_date: '2026-10-01',
        office: 'Charlotte',
        item_id: 'A Dell',
        purchase_date: '2026-08-15',
        unit_cost: 1200,
        allocated_cost: 1200,
      }),
      alloc({
        id: '2',
        lot_id: 'lot-b',
        assigned_date: '2026-10-01',
        office: 'Charlotte',
        item_id: 'B Dell',
        purchase_date: '2026-09-03',
        unit_cost: 1350,
        allocated_cost: 1350,
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.purchase_date)).toEqual(['2026-08-15', '2026-09-03'])
    expect(groups.map((g) => g.quantity)).toEqual([1, 1])
    expect(groups.map((g) => g.allocated_cost)).toEqual([1200, 1350])
  })

  it('keeps different objects on the same day as separate rows', () => {
    const groups = groupMonthEndRows([
      alloc({
        id: '1',
        lot_id: 'lot-lat',
        assigned_date: '2026-10-01',
        office: 'Charlotte',
        item_id: 'A Dell',
        manufacturer: 'Dell',
        model: 'Latitude 5550',
      }),
      alloc({
        id: '2',
        lot_id: 'lot-hp',
        assigned_date: '2026-10-01',
        office: 'Charlotte',
        item_id: 'B HP',
        manufacturer: 'HP',
        model: 'EliteBook',
        purchase_date: '2026-09-20',
        unit_cost: 900,
        allocated_cost: 900,
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.item_id).sort()).toEqual(['A Dell', 'B HP'])
  })

  it('puts a late-recorded charge on the month it was recorded, keeping the original assigned date', () => {
    const groups = groupMonthEndRows([
      alloc({
        id: '1',
        lot_id: 'lot-a',
        assigned_date: '2026-06-23',
        recorded_date: '2026-06-23',
        office: 'Atlanta',
        item_id: '003',
      }),
      alloc({
        id: '2',
        lot_id: 'lot-a',
        assigned_date: '2026-06-23',
        recorded_date: '2026-10-05',
        office: 'Atlanta',
        item_id: '003',
      }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => [g.report_month, g.assigned_date, g.recorded_late])).toEqual([
      ['2026-06', '2026-06-23', false],
      ['2026-10', '2026-06-23', true],
    ])
    const csv = monthEndCsv(groups, { includeMonthColumn: true })
    expect(csv).toContain('2026-10,,2026-06-23,003,')
  })

  it('falls back to assigned_date when recorded_date is missing', () => {
    expect(allocationReportDate({ assigned_date: '2026-09-01', recorded_date: null })).toBe('2026-09-01')
    expect(allocationReportDate({ assigned_date: '2026-06-23', recorded_date: '2026-10-05' })).toBe(
      '2026-10-05'
    )
  })

  it('limits trailing month keys to 12 by default and CSV includes a month column for multi-month files', () => {
    const keys = trailingMonthKeys(new Date('2026-09-01T15:00:00Z'))
    expect(keys).toHaveLength(12)
    expect(keys[0]).toBe('2026-09')
    expect(keys[11]).toBe('2025-10')
    expect(isMonthInWindow('2026-09', new Date('2026-09-15T15:00:00Z'))).toBe(true)
    expect(isMonthInWindow('2025-08', new Date('2026-09-15T15:00:00Z'))).toBe(false)
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(yearsFromMonthKeys(['2026-09', '2026-10', '2027-01'])).toEqual([2027, 2026])
    const csv = monthEndCsv(
      [
        {
          key: 'k',
          assigned_date: '2026-10-01',
          report_month: '2026-10',
          recorded_late: false,
          item_id: '010101 Dell Latitude',
          cpa_number: 'CPA-100',
          office: 'Florida',
          quantity: 2,
          unit_cost: 1000,
          allocated_cost: 2000,
          unmatched: false,
          purchase_date: '2026-09-15',
          manufacturer: 'Dell',
          model: 'Latitude 5550',
          rows: [],
        },
      ],
      { includeMonthColumn: true }
    )
    expect(csv).toContain(
      'Month,CPA #,Date assigned,Invoice #,Make / Model,Lot purchased,Office,Quantity,Unit cost,Allocated cost'
    )
    expect(csv).toContain(
      '2026-10,CPA-100,2026-10-01,010101 Dell Latitude,Dell Latitude 5550,2026-09-15,Florida,2,1000,2000'
    )
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('computes period bounds in America/New_York', () => {
    const asOf = new Date('2026-09-15T18:00:00Z')
    expect(periodBounds('month', { month: '2026-09' }, asOf)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    })
    expect(periodBounds('month_to_month', { startMonth: '2026-03', endMonth: '2026-06' }, asOf)).toEqual({
      start: '2026-03-01',
      end: '2026-06-30',
    })
    expect(periodBounds('yearly', { year: 2026 }, asOf)).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    })
    expect(() =>
      periodBounds('month_to_month', { startMonth: '2026-06', endMonth: '2026-03' }, asOf)
    ).toThrow('Start month must be on or before end month')
  })

  it('labels periods and totals the table', () => {
    const asOf = new Date('2026-09-15T18:00:00Z')
    expect(periodLabel('month', { month: '2026-09' }, asOf)).toBe('September 2026')
    expect(periodLabel('month_to_month', { startMonth: '2026-03', endMonth: '2026-06' }, asOf)).toBe(
      'March–June 2026'
    )
    expect(periodLabel('month_to_month', { startMonth: '2025-11', endMonth: '2026-02' }, asOf)).toBe(
      'November 2025 – February 2026'
    )
    expect(periodLabel('yearly', { year: 2026 }, asOf)).toBe('2026')
    expect(reportYearOptions([2025], asOf)).toEqual([2026, 2025])
    expect(reportCsvFilename('2026-09-01', '2026-09-30')).toBe('stock-report-2026-09.csv')
    expect(reportCsvFilename('2026-01-01', '2026-12-31')).toBe('stock-report-2026.csv')
    expect(reportCsvFilename('2026-03-01', '2026-06-30')).toBe('stock-report-2026-03-01-to-2026-06-30.csv')
    expect(reportTotals([
      {
        key: 'a',
        assigned_date: '2026-09-01',
        report_month: '2026-09',
        recorded_late: false,
        item_id: 'x',
        office: 'Florida',
        quantity: 2,
        unit_cost: 1000,
        allocated_cost: 2000,
        unmatched: false,
        cpa_number: null,
        purchase_date: null,
        manufacturer: null,
        model: null,
        rows: [],
      },
      {
        key: 'b',
        assigned_date: '2026-09-02',
        report_month: '2026-09',
        recorded_late: false,
        item_id: 'y',
        office: 'Charlotte',
        quantity: 1,
        unit_cost: 500,
        allocated_cost: 500.5,
        unmatched: false,
        cpa_number: null,
        purchase_date: null,
        manufacturer: null,
        model: null,
        rows: [],
      },
    ])).toEqual({ quantity: 3, allocated_cost: 2500.5 })
    expect(
      officeReportTotals([
        {
          key: 'a',
          assigned_date: '2026-09-01',
          report_month: '2026-09',
          recorded_late: false,
          item_id: 'x',
          office: 'Florida',
          quantity: 2,
          unit_cost: 1000,
          allocated_cost: 2000,
          unmatched: false,
          cpa_number: null,
          purchase_date: null,
          manufacturer: null,
          model: null,
          rows: [],
        },
        {
          key: 'b',
          assigned_date: '2026-09-02',
          report_month: '2026-09',
          recorded_late: false,
          item_id: 'y',
          office: 'Charlotte',
          quantity: 1,
          unit_cost: 500,
          allocated_cost: 500.5,
          unmatched: false,
          cpa_number: null,
          purchase_date: null,
          manufacturer: null,
          model: null,
          rows: [],
        },
        {
          key: 'c',
          assigned_date: '2026-09-03',
          report_month: '2026-09',
          recorded_late: false,
          item_id: 'z',
          office: 'Florida',
          quantity: 1,
          unit_cost: 100,
          allocated_cost: 100,
          unmatched: false,
          cpa_number: null,
          purchase_date: null,
          manufacturer: null,
          model: null,
          rows: [],
        },
      ])
    ).toEqual([
      { office: 'Charlotte', quantity: 1, allocated_cost: 500.5 },
      { office: 'Florida', quantity: 3, allocated_cost: 2100 },
    ])
    expect(completedMonthKey(new Date('2026-09-15T18:00:00Z'))).toBe('2026-08')
    expect(completedMonthKey(new Date('2026-01-01T16:00:00Z'))).toBe('2025-12')
  })

  it('rejects inverted or oversized report ranges', () => {
    expect(assertReportRange('2026-06-30', '2026-03-01')).toEqual({
      ok: false,
      error: 'Start date must be on or before end date',
    })
    expect(assertReportRange('2024-01-01', '2026-09-01').ok).toBe(false)
    expect(assertReportRange('2026-01-01', '2026-12-31')).toEqual({ ok: true })
    expect(REPORT_MAX_SPAN_MONTHS).toBe(24)
  })
})

describe('not from stock persistence', () => {
  it('skips charging unless a lot is explicitly chosen', () => {
    expect(
      shouldSkipStockBecauseNotFromStock({
        deviceNotFromStock: true,
        lotId: null,
      })
    ).toBe(true)
    expect(
      shouldSkipStockBecauseNotFromStock({
        notFromStock: true,
        lotId: '',
      })
    ).toBe(true)
    expect(
      shouldSkipStockBecauseNotFromStock({
        deviceNotFromStock: true,
        lotId: 'lot-1',
      })
    ).toBe(false)
  })
})

describe('stock report email', () => {
  it('defaults the cron range to the month that just closed', () => {
    const range = resolveReportEmailRange(null, new Date('2026-09-15T18:00:00Z'))
    expect(range).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
      label: 'August 2026',
    })
    expect(resolveReportEmailRange({ month: '2026-09' }).label).toBe('September 2026')
  })

  it('renders office totals and an empty-month note', () => {
    const html = stockReportEmailHtml({
      label: 'August 2026',
      groups: [
        {
          key: 'k',
          assigned_date: '2026-08-02',
          report_month: '2026-08',
          recorded_late: false,
          item_id: 'A Dell',
          office: 'Charlotte',
          quantity: 1,
          unit_cost: 1000,
          allocated_cost: 1000,
          unmatched: false,
          cpa_number: null,
          purchase_date: null,
          manufacturer: null,
          model: null,
          rows: [],
        },
      ],
      appUrl: 'https://app-ems-bp-prod.azurewebsites.net',
    })
    expect(html).toContain('Charlotte')
    expect(html).toContain('$1,000.00')
    expect(html).toContain('https://app-ems-bp-prod.azurewebsites.net/stock/reports')
    expect(stockReportEmailHtml({ label: 'July 2026', groups: [] })).toContain(
      'No stock assignments in July 2026'
    )
  })
})

'use client'

import { formatLotOptionLabel } from '@/lib/stock-tracker'

export interface StockLotOption {
  id: string
  item_id: string
  purchase_date?: string
  qty_in_stock: number
  manufacturer?: string | null
  model?: string | null
  unit_cost?: number | null
}

export function StockLotFields({
  lots,
  lotId,
  skipLot,
  onLotId,
  onSkip,
  chargeOffices,
  chargeOffice,
  onChargeOffice,
  disabled,
  allowSkip = true,
  hint,
  showCharge: showChargeProp,
}: {
  lots: StockLotOption[]
  lotId: string
  skipLot: boolean
  onLotId: (id: string) => void
  onSkip: (skip: boolean) => void
  chargeOffices: string[]
  chargeOffice: string
  onChargeOffice: (office: string) => void
  disabled?: boolean
  allowSkip?: boolean
  hint?: string
  showCharge?: boolean
}) {
  const showCharge = showChargeProp !== false && !skipLot

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2 md:col-span-2">
      <p className="text-sm font-medium text-gray-900">Stock purchase lot</p>
      <p className="text-xs text-gray-500">
        {hint ||
          'Oldest matching open lot is selected. Change it if needed, or mark Not from stock.'}
      </p>
      <select
        value={skipLot ? '' : lotId}
        onChange={(e) => onLotId(e.target.value)}
        disabled={disabled || skipLot}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
      >
        <option value="">Select a lot…</option>
        {lots.map((lot) => (
          <option key={lot.id} value={lot.id} disabled={lot.qty_in_stock < 1}>
            {formatLotOptionLabel(lot)}
          </option>
        ))}
      </select>
      {showCharge && (
        <label className="block text-xs font-medium text-gray-700">
          Charge to
          <select
            value={chargeOffice}
            onChange={(e) => onChargeOffice(e.target.value)}
            disabled={disabled}
            className="mt-1 w-full px-3 py-2 text-sm font-normal border border-gray-300 rounded-lg bg-white"
          >
            <option value="">Select office…</option>
            {chargeOffices.map((office) => (
              <option key={office} value={office}>
                {office}
              </option>
            ))}
          </select>
        </label>
      )}
      {allowSkip && (
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={skipLot}
            onChange={(e) => onSkip(e.target.checked)}
            disabled={disabled}
          />
          Not from stock inventory (don’t charge a lot)
        </label>
      )}
    </div>
  )
}

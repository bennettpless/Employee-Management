'use client'

import { useEffect, useState } from 'react'
import { StockLotFields, type StockLotOption } from '@/components/stock/StockLotFields'
import { CHARGE_OFFICE_REQUIRED } from '@/lib/stock-tracker'

export function StockLotPromptDialog({
  candidates,
  saving,
  title = 'Which purchase lot?',
  hint,
  confirmLabel = 'Save',
  initialLotId,
  chargeOffices: chargeOfficesProp,
  onConfirmLot,
  onNotFromStock,
}: {
  candidates: StockLotOption[]
  saving?: boolean
  title?: string
  hint?: string
  confirmLabel?: string
  initialLotId?: string
  chargeOffices?: string[]
  onConfirmLot: (lotId: string, chargeOffice: string) => void | Promise<void>
  onNotFromStock: () => void | Promise<void>
}) {
  const [lotId, setLotId] = useState(initialLotId || '')
  const [skip, setSkip] = useState(false)
  const [chargeOffice, setChargeOffice] = useState('')
  const [chargeOffices, setChargeOffices] = useState<string[]>(chargeOfficesProp || [])
  const canSave = skip || (Boolean(lotId) && Boolean(chargeOffice))

  useEffect(() => {
    if (chargeOfficesProp && chargeOfficesProp.length > 0) {
      setChargeOffices(chargeOfficesProp)
      return
    }
    let cancelled = false
    fetch('/api/stock/lots')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setChargeOffices(data.charge_offices || [])
      })
      .catch(() => {
        if (!cancelled) setChargeOffices([])
      })
    return () => {
      cancelled = true
    }
  }, [chargeOfficesProp])

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <StockLotFields
          lots={candidates}
          lotId={lotId}
          skipLot={skip}
          onLotId={(id) => {
            setLotId(id)
            setSkip(false)
          }}
          onSkip={(next) => {
            setSkip(next)
            if (next) {
              setLotId('')
              setChargeOffice('')
            }
          }}
          chargeOffices={chargeOffices}
          chargeOffice={chargeOffice}
          onChargeOffice={setChargeOffice}
          disabled={saving}
          allowSkip
          hint={
            hint ||
            'Pick the lot to charge, or check Not from stock if this PC did not come from a purchase lot.'
          }
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving || !canSave}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            onClick={() => {
              if (skip) {
                void onNotFromStock()
                return
              }
              if (!chargeOffice) return
              void onConfirmLot(lotId, chargeOffice)
            }}
            title={!skip && lotId && !chargeOffice ? CHARGE_OFFICE_REQUIRED : undefined}
          >
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

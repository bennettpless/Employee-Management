'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { ASSET_TYPE_LABELS } from '@/lib/devices'
import { STOCK_ASSET_TYPES, isManualLotChargeType, type LotWithMetrics, type StockAssetType } from '@/lib/stock-tracker'

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export interface PurchaseLotForm {
  item_id: string
  purchase_date: string
  vendor: string
  item_description: string
  qty_purchased: string
  unit_cost: string
  asset_type: StockAssetType
  manufacturer: string
  model: string
}

function toForm(lot?: LotWithMetrics | null): PurchaseLotForm {
  return {
    item_id: lot?.item_id || '',
    purchase_date: lot?.purchase_date || '',
    vendor: lot?.vendor || '',
    item_description: lot?.item_description || '',
    qty_purchased: lot ? String(lot.qty_purchased) : '',
    unit_cost: lot ? String(lot.unit_cost) : '',
    asset_type: lot?.asset_type || 'laptop',
    manufacturer: lot?.manufacturer || '',
    model: lot?.model || '',
  }
}

export default function PurchaseLotModal({
  lot,
  chargeOffices = [],
  onSaved,
  onClose,
}: {
  lot?: LotWithMetrics | null
  chargeOffices?: string[]
  onSaved: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState<PurchaseLotForm>(() => toForm(lot))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chargeOffice, setChargeOffice] = useState('')
  const [chargeQty, setChargeQty] = useState('1')
  const [charging, setCharging] = useState(false)
  const showManualCharge = Boolean(lot && isManualLotChargeType(form.asset_type) && (lot.qty_in_stock || 0) > 0)

  const set =
    (field: keyof PurchaseLotForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const save = async () => {
    setError(null)
    if (!form.item_id.trim()) {
      setError('Item ID is required')
      return
    }
    if (!form.purchase_date) {
      setError('Purchase date is required')
      return
    }
    if (!form.manufacturer.trim()) {
      setError('Manufacturer is required')
      return
    }
    if (!form.model.trim()) {
      setError('Model is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        item_id: form.item_id.trim(),
        purchase_date: form.purchase_date,
        vendor: form.vendor.trim() || null,
        item_description: form.item_description.trim() || null,
        qty_purchased: Number(form.qty_purchased),
        unit_cost: Number(form.unit_cost),
        asset_type: form.asset_type,
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
      }
      const url = lot ? `/api/stock/lots/${lot.id}` : '/api/stock/lots'
      const res = await fetch(url, {
        method: lot ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const chargeToOffice = async () => {
    if (!lot) return
    setError(null)
    if (!chargeOffice) {
      setError('Pick which office to charge')
      return
    }
    setCharging(true)
    try {
      const res = await fetch('/api/stock/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lot_id: lot.id,
          charge_office: chargeOffice,
          quantity: Number(chargeQty),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Charge failed')
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Charge failed')
    } finally {
      setCharging(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {lot ? 'Edit purchase' : 'Add purchase'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <label className="block text-sm font-medium text-gray-700">
            Item ID
            <input value={form.item_id} onChange={set('item_id')} className={inputClass} disabled={saving} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Purchase date
            <input
              type="date"
              value={form.purchase_date}
              onChange={set('purchase_date')}
              className={inputClass}
              disabled={saving}
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Vendor
            <input value={form.vendor} onChange={set('vendor')} className={inputClass} disabled={saving} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Item description
            <textarea
              value={form.item_description}
              onChange={set('item_description')}
              className={inputClass}
              rows={2}
              disabled={saving}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">
              Qty purchased
              <input
                type="number"
                min={1}
                value={form.qty_purchased}
                onChange={set('qty_purchased')}
                className={inputClass}
                disabled={saving}
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Unit cost
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.unit_cost}
                onChange={set('unit_cost')}
                className={inputClass}
                disabled={saving}
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Type
            <select value={form.asset_type} onChange={set('asset_type')} className={inputClass} disabled={saving}>
              {STOCK_ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ASSET_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Enter Admin stock purchases (typically $200+). SSD, RAM, and Other are charged to an
              office from this screen — they are not devices. TVs and printers are not stock lots.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-gray-700">
              Manufacturer
              <input
                value={form.manufacturer}
                onChange={set('manufacturer')}
                className={inputClass}
                disabled={saving}
                placeholder="Dell"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Model
              <input
                value={form.model}
                onChange={set('model')}
                className={inputClass}
                disabled={saving}
                placeholder="Latitude 5550"
              />
            </label>
          </div>
          {showManualCharge && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
              <p className="text-sm font-medium text-amber-950">Charge to office</p>
              <p className="text-xs text-amber-800">
                {lot?.qty_in_stock} left in this lot. Charging writes the monthly accounting line
                without creating a device.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  Charge to
                  <select
                    value={chargeOffice}
                    onChange={(e) => setChargeOffice(e.target.value)}
                    className={inputClass}
                    disabled={saving || charging}
                  >
                    <option value="">Select office…</option>
                    {chargeOffices.map((office) => (
                      <option key={office} value={office}>
                        {office}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={lot?.qty_in_stock || 1}
                    value={chargeQty}
                    onChange={(e) => setChargeQty(e.target.value)}
                    className={inputClass}
                    disabled={saving || charging}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={chargeToOffice}
                disabled={saving || charging || !chargeOffice}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-md disabled:opacity-60"
              >
                {charging && <Loader2 className="w-4 h-4 animate-spin" />}
                Charge to office
              </button>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          {lot && lot.qty_assigned === 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`Delete purchase ${lot.item_id}?`)) return
                setSaving(true)
                setError(null)
                try {
                  const res = await fetch(`/api/stock/lots/${lot.id}`, { method: 'DELETE' })
                  const data = await res.json().catch(() => ({}))
                  if (!res.ok) throw new Error(data.error || 'Delete failed')
                  onSaved()
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : 'Delete failed')
                } finally {
                  setSaving(false)
                }
              }}
              className="mr-auto px-4 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md"
              disabled={saving}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

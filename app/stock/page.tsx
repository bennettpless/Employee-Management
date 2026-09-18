'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSpreadsheet, Loader2, Plus, Pencil, Package } from 'lucide-react'
import PurchaseLotModal from '@/components/stock/PurchaseLotModal'
import { ASSET_TYPE_LABELS, officeNameToLocation } from '@/lib/devices'
import { candidateLotsForPrompt, formatLotOptionLabel, formatUsd, type LotWithMetrics } from '@/lib/stock-tracker'

interface UnmatchedAllocation {
  id: string
  device_id: string | null
  assigned_date: string
  office: string
  quantity: number
  source: string
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
  asset_type?: string | null
  device_name?: string | null
  user_name?: string | null
}

export default function StockPage() {
  const [lots, setLots] = useState<LotWithMetrics[]>([])
  const [chargeOffices, setChargeOffices] = useState<string[]>([])
  const [remaining, setRemaining] = useState(0)
  const [unmatched, setUnmatched] = useState<UnmatchedAllocation[]>([])
  const [attachDrafts, setAttachDrafts] = useState<Record<string, { lotId: string; office: string }>>(
    {}
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalLot, setModalLot] = useState<LotWithMetrics | null | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stock/lots')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load stock tracker')
      setLots(data.lots || [])
      setChargeOffices(data.charge_offices || [])
      setRemaining(data.remaining_balance || 0)
      setUnmatched(data.unmatched || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load stock tracker')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const [busyId, setBusyId] = useState<string | null>(null)

  const attach = async (allocationId: string) => {
    const draft = attachDrafts[allocationId] || { lotId: '', office: '' }
    if (!draft.lotId) {
      setError('Pick a purchase lot')
      return
    }
    if (!draft.office) {
      setError('Pick which office to charge')
      return
    }
    setBusyId(allocationId)
    setError(null)
    const res = await fetch(`/api/stock/allocations/${allocationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot_id: draft.lotId, charge_office: draft.office }),
    })
    const data = await res.json()
    setBusyId(null)
    if (!res.ok) {
      setError(data.error || 'Failed to attach lot')
      return
    }
    await load()
  }

  const markNotFromStock = async (allocationId: string) => {
    setBusyId(allocationId)
    setError(null)
    const res = await fetch(`/api/stock/allocations/${allocationId}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to mark Not from stock')
      return
    }
    await load()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Package className="w-4 h-4" />
              Accounting
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Stock Tracker</h1>
            <p className="text-gray-600 mt-1">
              Purchase lots for Admin stock (typically $200+). Assigning a matching device from In Stock consumes one unit.
              Returning a device to stock does not add quantity back.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/stock/reports"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Reports
            </Link>
            <button
              type="button"
              onClick={() => setModalLot(null)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md"
            >
              <Plus className="w-4 h-4" />
              Add purchase
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Remaining stock value</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{formatUsd(remaining)}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Open lots</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {lots.filter((l) => l.qty_in_stock > 0).length}
            </p>
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {unmatched.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h2 className="font-semibold text-amber-900 mb-2">
              Unmatched assignments ({unmatched.length})
            </h2>
            <p className="text-sm text-amber-800 mb-3">
              These PCs were assigned without a matching purchase lot. Attach a lot and pick
              Charge to, or mark Not from stock so they are not charged on the report.
            </p>
            <ul className="space-y-2">
              {unmatched.map((row) => {
                const draft = attachDrafts[row.id] || { lotId: '', office: '' }
                return (
                <li key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-800">
                    {row.assigned_date} · {officeNameToLocation(row.office) || row.office} · qty{' '}
                    {row.quantity}
                    {row.user_name ? ` · ${row.user_name}` : ''}
                    {row.serial_number ? ` · ${row.serial_number}` : ''}
                    {row.manufacturer || row.model
                      ? ` · ${[row.manufacturer, row.model].filter(Boolean).join(' ')}`
                      : row.device_name
                        ? ` · ${row.device_name}`
                        : ''}
                  </span>
                  <select
                    className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
                    value={draft.lotId}
                    disabled={busyId === row.id}
                    onChange={(e) => {
                      const lotId = e.target.value
                      setAttachDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...draft, lotId },
                      }))
                    }}
                  >
                    <option value="">Attach to lot…</option>
                    {candidateLotsForPrompt(lots, {
                      asset_type: row.asset_type,
                      manufacturer: row.manufacturer,
                      model: row.model,
                    }).map((lot) => (
                      <option key={lot.id} value={lot.id} disabled={lot.qty_in_stock < row.quantity}>
                        {formatLotOptionLabel(lot)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
                    value={draft.office}
                    disabled={busyId === row.id}
                    onChange={(e) => {
                      const office = e.target.value
                      setAttachDrafts((prev) => ({
                        ...prev,
                        [row.id]: { ...draft, office },
                      }))
                    }}
                  >
                    <option value="">Charge to…</option>
                    {chargeOffices.map((office) => (
                      <option key={office} value={office}>
                        {office}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busyId === row.id || !draft.lotId || !draft.office}
                    onClick={() => attach(row.id)}
                    className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {busyId === row.id ? 'Saving…' : 'Attach'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => markNotFromStock(row.id)}
                    className="rounded-md border border-amber-300 bg-white px-2 py-1 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {busyId === row.id ? 'Saving…' : 'Not from stock'}
                  </button>
                </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : lots.length === 0 ? (
            <p className="text-center text-gray-500 py-16">
              No lots with remaining stock. Depleted lots leave this page after the month they empty;
              they stay on Reports.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Item ID</th>
                  <th className="px-4 py-3">Purchase date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Qty purchased</th>
                  <th className="px-4 py-3 text-right">Unit cost</th>
                  <th className="px-4 py-3 text-right">Total purchase cost</th>
                  <th className="px-4 py-3 text-right">Qty assigned</th>
                  <th className="px-4 py-3 text-right">Qty in stock</th>
                  <th className="px-4 py-3 text-right">Stock value</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lots.map((lot) => (
                  <tr key={lot.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {lot.item_id}
                      <div className="text-xs text-gray-500 font-normal">
                        {ASSET_TYPE_LABELS[lot.asset_type]}
                        {lot.manufacturer || lot.model
                          ? ` · ${[lot.manufacturer, lot.model].filter(Boolean).join(' ')}`
                          : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{lot.purchase_date}</td>
                    <td className="px-4 py-3 text-gray-700">{lot.vendor || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">{lot.item_description || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{lot.qty_purchased}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUsd(lot.unit_cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsd(lot.total_purchase_cost)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{lot.qty_assigned}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{lot.qty_in_stock}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatUsd(lot.stock_value)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setModalLot(lot)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modalLot !== undefined && (
        <PurchaseLotModal
          lot={modalLot}
          chargeOffices={chargeOffices}
          onClose={() => setModalLot(undefined)}
          onSaved={() => {
            setModalLot(undefined)
            load()
          }}
        />
      )}
    </div>
  )
}

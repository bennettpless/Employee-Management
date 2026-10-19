'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { ASSET_TYPE_LABELS, officeNameToLocation } from '@/lib/devices'
import {
  candidateLotsForPrompt,
  formatLotOptionLabel,
  pickFifoLot,
  ymdInTimeZone,
  type LotWithMetrics,
} from '@/lib/stock-tracker'

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

interface ChargeableDevice {
  id: string
  device_name: string | null
  asset_tag: string | null
  serial_number: string | null
  asset_type: string
  manufacturer: string | null
  model: string | null
  location: string | null
  not_from_stock: boolean
  user_name: string | null
  assigned_date: string | null
}

function deviceLabel(d: ChargeableDevice): string {
  return d.device_name || d.asset_tag || d.serial_number || 'Unnamed device'
}

function deviceDetail(d: ChargeableDevice): string {
  return [
    d.user_name,
    [d.manufacturer, d.model].filter(Boolean).join(' ') || ASSET_TYPE_LABELS[d.asset_type as keyof typeof ASSET_TYPE_LABELS],
    d.serial_number,
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function ChargeDeviceModal({
  lots,
  chargeOffices,
  onSaved,
  onClose,
}: {
  lots: LotWithMetrics[]
  chargeOffices: string[]
  onSaved: () => void
  onClose: () => void
}) {
  const [devices, setDevices] = useState<ChargeableDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [lotId, setLotId] = useState('')
  const [office, setOffice] = useState('')
  const [assignedDate, setAssignedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = ymdInTimeZone(new Date())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/stock/chargeable-devices', { cache: 'no-store' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load devices')
        if (!cancelled) setDevices(data.devices || [])
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load devices')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selected = devices.find((d) => d.id === deviceId) || null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return devices
    return devices.filter((d) =>
      [d.device_name, d.asset_tag, d.serial_number, d.user_name, d.manufacturer, d.model]
        .some((v) => (v || '').toLowerCase().includes(q))
    )
  }, [devices, query])

  const lotOptions = useMemo(
    () => (selected ? candidateLotsForPrompt(lots, selected) : []),
    [lots, selected]
  )

  const pickDevice = (d: ChargeableDevice) => {
    setDeviceId(d.id)
    setLotId(pickFifoLot(lots, d)?.id || '')
    const loc = officeNameToLocation(d.location || '')
    setOffice(chargeOffices.includes(loc) ? loc : '')
    setAssignedDate(d.assigned_date && d.assigned_date <= today ? d.assigned_date : today)
    setError(null)
  }

  const submit = async () => {
    if (!selected) {
      setError('Pick a device')
      return
    }
    if (!lotId) {
      setError('Pick a purchase lot')
      return
    }
    if (!office) {
      setError('Pick which office to charge')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/stock/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: selected.id,
          lot_id: lotId,
          charge_office: office,
          assigned_date: assignedDate || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Charge failed')
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Charge failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Charge existing device</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={saving}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            For PCs that were already assigned before their purchase lot was entered. Only assigned,
            non-loaner devices that are not yet charged to a lot are listed.
          </p>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {selected ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{deviceLabel(selected)}</p>
                <p className="text-xs text-gray-600 truncate">{deviceDetail(selected)}</p>
                {selected.not_from_stock && (
                  <p className="text-xs text-amber-700 mt-1">
                    Currently marked Not from stock — charging will clear that.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDeviceId('')}
                className="text-xs text-blue-700 hover:underline flex-shrink-0"
                disabled={saving}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Device
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search device name, serial, asset tag, or user…"
                  className={inputClass}
                />
              </label>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200">
                {loading ? (
                  <div className="flex items-center justify-center py-6 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500">
                    {devices.length === 0 ? 'Every assigned PC is already charged to a lot.' : 'No matches'}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {filtered.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => pickDevice(d)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50"
                        >
                          <span className="block text-sm text-gray-900 truncate">{deviceLabel(d)}</span>
                          <span className="block text-xs text-gray-500 truncate">{deviceDetail(d)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {selected && (
            <>
              <label className="block text-sm font-medium text-gray-700">
                Purchase lot
                <select value={lotId} onChange={(e) => setLotId(e.target.value)} className={inputClass} disabled={saving}>
                  <option value="">Select lot…</option>
                  {lotOptions.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {formatLotOptionLabel(lot)}
                    </option>
                  ))}
                </select>
                {lotOptions.length === 0 && (
                  <span className="mt-1 block text-xs font-normal text-amber-700">
                    No lots with remaining stock. Add the purchase first.
                  </span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-gray-700">
                  Charge to
                  <select value={office} onChange={(e) => setOffice(e.target.value)} className={inputClass} disabled={saving}>
                    <option value="">Select office…</option>
                    {chargeOffices.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Assigned date
                  <input
                    type="date"
                    value={assignedDate}
                    max={today}
                    onChange={(e) => setAssignedDate(e.target.value)}
                    className={inputClass}
                    disabled={saving}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Defaults to when the current user was assigned, and shows as the Date assigned on
                Reports. The charge itself goes on this month&apos;s report.
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
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
            onClick={submit}
            disabled={saving || !selected || !lotId || !office}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Charge
          </button>
        </div>
      </div>
    </div>
  )
}

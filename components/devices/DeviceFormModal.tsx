'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, X, ChevronsUpDown } from 'lucide-react'
import { Device } from '@/lib/types'
import {
  ASSET_TYPE_LABELS,
  DEPARTMENTS,
  DEVICE_STATUS_FILTERS,
  DEVICE_STATUS_FILTER_LABELS,
  applyStatusSelect,
  deviceTypeSelectOptions,
  statusSelectValue,
  officeNameToLocation,
} from '@/lib/devices'
import { defaultLoanerDueDate, isLoanerOverdue } from '@/lib/loaner-checkout'
import { StockLotFields } from '@/components/stock/StockLotFields'
import { StockLotPromptDialog } from '@/components/stock/StockLotPromptDialog'
import {
  candidateLotsForPrompt,
  isStockAssetType,
  pickFifoLot,
  type LotWithMetrics,
} from '@/lib/stock-tracker'

interface EmployeeOption {
  id: string
  display_name: string | null
  email: string
}

export interface DeviceFormValues {
  device_name: string
  asset_tag: string
  asset_type: string
  manufacturer: string
  model: string
  serial_number: string
  department: string
  location: string
  status: string
  is_loaner: boolean
  employee_id: string
  loaner_due_date: string
  commissioned_at: string
  decommissioned_at: string
  warranty_months: string
  warranty_end: string
  notes: string
}

function toFormValues(device?: Device | null): DeviceFormValues {
  return {
    device_name: device?.device_name || '',
    asset_tag: device?.asset_tag || '',
    asset_type: device?.asset_type || '',
    manufacturer: device?.manufacturer || '',
    model: device?.model || '',
    serial_number: device?.serial_number || '',
    department: device?.department || '',
    location: device?.location || '',
    status: device?.status || 'active',
    is_loaner: Boolean(device?.is_loaner),
    employee_id: device?.employee_id || '',
    loaner_due_date: device?.loaner_due_date || '',
    commissioned_at: device?.commissioned_at || '',
    decommissioned_at: device?.decommissioned_at || '',
    warranty_months: device?.warranty_months != null ? String(device.warranty_months) : '',
    warranty_end: device?.warranty_end || '',
    notes: device?.notes || '',
  }
}

function employeeLabel(e: EmployeeOption): string {
  return e.display_name || e.email
}

interface DeviceFormModalProps {
  /** When set, the modal edits this device; otherwise it creates a new one */
  device?: Device | null
  onSaved: (device: Device) => void
  onClose: () => void
}

export default function DeviceFormModal({ device, onSaved, onClose }: DeviceFormModalProps) {
  const [form, setForm] = useState<DeviceFormValues>(() => toFormValues(device))
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lots, setLots] = useState<LotWithMetrics[]>([])
  const [chargeOffices, setChargeOffices] = useState<string[]>([])
  const [lotId, setLotId] = useState(() => device?.stock_lot_id || '')
  const [chargeOffice, setChargeOffice] = useState('')
  const [skipLot, setSkipLot] = useState(() => Boolean(device?.not_from_stock))
  const [lotTouched, setLotTouched] = useState(() => Boolean(device?.stock_lot_id))
  const [legacyLotPrompt, setLegacyLotPrompt] = useState<{
    allocation_id: string
    device: Device
    candidates: Array<{
      id: string
      item_id: string
      purchase_date: string
      qty_in_stock: number
      manufacturer: string | null
      model: string | null
    }>
  } | null>(null)
  const [legacyLotSaving, setLegacyLotSaving] = useState(false)

  // Searchable assignee picker (native <select> typeahead resets after ~1s / 2 chars)
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const assigneeBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [empRes, officeRes, lotsRes] = await Promise.all([
          fetch('/api/employees?status=active', { cache: 'no-store' }),
          fetch('/api/network/offices', { cache: 'no-store' }),
          fetch('/api/stock/lots', { cache: 'no-store' }),
        ])
        const empData = await empRes.json()
        const officeData = await officeRes.json()
        const lotsData = await lotsRes.json()
        if (!cancelled && lotsRes.ok) {
          setLots(lotsData.lots || [])
          setChargeOffices(lotsData.charge_offices || [])
        }
        if (cancelled) return
        const list: EmployeeOption[] = (empData.employees || []).map((e: any) => ({
          id: e.id,
          display_name: e.display_name,
          email: e.email,
        }))
        // Keep the current assignee selectable even if they are not in the
        // active employee list (e.g. legacy terminated rows).
        if (
          device?.employee_id &&
          device.employee &&
          !list.some((e) => e.id === device.employee_id)
        ) {
          list.unshift({
            id: device.employee.id,
            display_name: device.employee.display_name
              ? `${device.employee.display_name} (inactive)`
              : device.employee.email,
            email: device.employee.email,
          })
        }
        setEmployees(list)
        const officeNames: string[] = Array.from(
          new Set((officeData.offices || []).map((o: any) => officeNameToLocation(o.name)))
        )
        if (!officeNames.includes('Remote')) officeNames.push('Remote')
        setLocations(officeNames)
      } catch (e) {
        console.error('Error loading form options:', e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // Only re-run when the assigned employee id changes — not when the parent
    // re-creates the device.employee object reference (that was resetting the
    // native select typeahead mid-keystroke).
  }, [device?.employee_id, device?.employee?.id, device?.employee?.display_name, device?.employee?.email])

  useEffect(() => {
    if (!assigneeOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (!assigneeBoxRef.current?.contains(e.target as Node)) {
        setAssigneeOpen(false)
        setAssigneeQuery('')
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [assigneeOpen])

  const needsStockLot =
    isStockAssetType(form.asset_type) &&
    !form.is_loaner &&
    (!device?.employee_id || Boolean(device.not_from_stock))
  const assigningPerson = Boolean(form.employee_id)

  useEffect(() => {
    if (!needsStockLot || skipLot || lotTouched) return
    const picked = pickFifoLot(lots, {
      asset_type: form.asset_type,
      manufacturer: form.manufacturer,
      model: form.model,
    })
    setLotId(picked?.id || '')
  }, [
    needsStockLot,
    skipLot,
    lotTouched,
    lots,
    form.asset_type,
    form.manufacturer,
    form.model,
  ])

  const lotOptions = useMemo(
    () =>
      candidateLotsForPrompt(lots, {
        asset_type: form.asset_type,
        manufacturer: form.manufacturer,
        model: form.model,
      }),
    [lots, form.asset_type, form.manufacturer, form.model]
  )

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === form.employee_id) || null,
    [employees, form.employee_id]
  )

  const filteredEmployees = useMemo(() => {
    const q = assigneeQuery.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) => {
      const name = (e.display_name || '').toLowerCase()
      const email = (e.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [employees, assigneeQuery])

  const set = (field: keyof DeviceFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  const pickAssignee = (id: string) => {
    setForm((f) => ({
      ...f,
      employee_id: id,
      status: f.is_loaner ? (id ? 'active' : 'in_stock') : f.status,
      loaner_due_date:
        f.is_loaner && id
          ? f.loaner_due_date || defaultLoanerDueDate()
          : id
            ? f.loaner_due_date
            : '',
    }))
    setAssigneeOpen(false)
    setAssigneeQuery('')
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!form.asset_type) {
      setError('Asset type is required')
      return
    }
    if (form.is_loaner && form.employee_id && !form.loaner_due_date) {
      setError('Loaner due date is required when a loaner is checked out')
      return
    }
    if (needsStockLot && !skipLot && !lotId) {
      setError('Pick which purchase lot this PC came from, or check Not from stock')
      return
    }
    if (needsStockLot && !skipLot && lotId && assigningPerson && !chargeOffice) {
      setError('Pick which office to charge')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        device_name: form.device_name,
        asset_tag: form.asset_tag,
        asset_type: form.asset_type,
        manufacturer: form.manufacturer,
        model: form.model,
        serial_number: form.serial_number,
        department: form.department,
        location: form.location,
        status: form.status,
        is_loaner: form.is_loaner,
        employee_id: form.employee_id || null,
        loaner_due_date: form.is_loaner && form.employee_id ? form.loaner_due_date || null : null,
        commissioned_at: form.commissioned_at || null,
        decommissioned_at: form.decommissioned_at || null,
        warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
        warranty_end: form.warranty_end || null,
        notes: form.notes,
      }
      if (needsStockLot) {
        payload.not_from_stock = skipLot
        payload.lot_id = skipLot ? null : lotId || null
        payload.charge_office = skipLot ? null : chargeOffice || null
      }
      const res = await fetch(device ? `/api/devices/${device.id}` : '/api/devices', {
        method: device ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save device')
      }
      if (data.stock_lot && data.stock_lot.allocation_id && !data.stock_lot.selected_lot_id) {
        setLegacyLotPrompt({
          allocation_id: data.stock_lot.allocation_id,
          device: data.device,
          candidates: data.stock_lot.candidates || [],
        })
        return
      }
      onSaved(data.device)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  const locationOptions = form.location && !locations.includes(form.location)
    ? [form.location, ...locations]
    : locations

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{device ? 'Edit Device' : 'Add Device'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={saving}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Device Name</label>
            <input
              type="text"
              value={form.device_name}
              onChange={set('device_name')}
              placeholder="e.g., BPL-5XBKPK4"
              className={inputClass}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">
              NinjaOne system name / hostname — used when matching machines from the onboarding sheet
            </p>
          </div>

          <div>
            <label className={labelClass}>
              Asset Type <span className="text-red-500">*</span>
            </label>
            <select value={form.asset_type} onChange={set('asset_type')} className={inputClass} disabled={saving}>
              <option value="">Select type...</option>
              {deviceTypeSelectOptions(form.asset_type).map((t) => (
                <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Asset Tag</label>
            <input type="text" value={form.asset_tag} onChange={set('asset_tag')} placeholder="e.g., BP-00123" className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Make / Manufacturer</label>
            <input type="text" value={form.manufacturer} onChange={set('manufacturer')} placeholder="e.g., Dell" className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Model</label>
            <input type="text" value={form.model} onChange={set('model')} placeholder="e.g., Latitude 7450" className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Serial Number</label>
            <input type="text" value={form.serial_number} onChange={set('serial_number')} className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select
              value={statusSelectValue(form.status, form.is_loaner)}
              onChange={(e) => {
                const next = applyStatusSelect(e.target.value, Boolean(form.employee_id))
                setForm((f) => ({
                  ...f,
                  status: next.status,
                  is_loaner: next.is_loaner,
                  loaner_due_date:
                    next.is_loaner && f.employee_id
                      ? f.loaner_due_date || defaultLoanerDueDate()
                      : next.is_loaner
                        ? f.loaner_due_date
                        : '',
                }))
              }}
              className={inputClass}
              disabled={saving}
            >
              {DEVICE_STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{DEVICE_STATUS_FILTER_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2" ref={assigneeBoxRef}>
            <label className={labelClass}>Assigned User</label>
            <div className="relative">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setAssigneeOpen((o) => !o)
                  setAssigneeQuery('')
                }}
                className={`${inputClass} flex items-center justify-between text-left bg-white disabled:opacity-50`}
              >
                <span className={selectedEmployee ? 'text-gray-900' : 'text-gray-500'}>
                  {selectedEmployee ? employeeLabel(selectedEmployee) : 'Unassigned'}
                </span>
                <ChevronsUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
              {assigneeOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      autoFocus
                      value={assigneeQuery}
                      onChange={(e) => setAssigneeQuery(e.target.value)}
                      placeholder="Type a name or email..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      disabled={saving}
                    />
                  </div>
                  <ul className="max-h-56 overflow-y-auto py-1">
                    <li>
                      <button
                        type="button"
                        onClick={() => pickAssignee('')}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                          !form.employee_id ? 'bg-blue-50 text-blue-800 font-medium' : 'text-gray-700'
                        }`}
                      >
                        Unassigned
                      </button>
                    </li>
                    {filteredEmployees.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
                    ) : (
                      filteredEmployees.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => pickAssignee(e.id)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                              form.employee_id === e.id
                                ? 'bg-blue-50 text-blue-800 font-medium'
                                : 'text-gray-900'
                            }`}
                          >
                            <span className="block truncate">{employeeLabel(e)}</span>
                            {e.display_name && e.email && (
                              <span className="block truncate text-xs text-gray-500">{e.email}</span>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {form.is_loaner && form.employee_id && (
            <div className="md:col-span-2">
              <label className={labelClass}>
                Loaner due date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.loaner_due_date}
                onChange={set('loaner_due_date')}
                className={inputClass}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-gray-500">
                Defaults to 14 days from today. Overdue loaners show on the Devices list.
                {isLoanerOverdue(form.loaner_due_date, true) ? ' This date is already past due.' : ''}
              </p>
            </div>
          )}

          <div>
            <label className={labelClass}>Department</label>
            <select value={form.department} onChange={set('department')} className={inputClass} disabled={saving}>
              <option value="">— None —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              {form.department && !DEPARTMENTS.includes(form.department as (typeof DEPARTMENTS)[number]) && (
                <option value={form.department}>
                  ⚠ {form.department} (non-canonical)
                </option>
              )}
            </select>
          </div>

          <div>
            <label className={labelClass}>Location</label>
            <select value={form.location} onChange={set('location')} className={inputClass} disabled={saving}>
              <option value="">Select location...</option>
              {locationOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Commission Date</label>
            <input type="date" value={form.commissioned_at} onChange={set('commissioned_at')} className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Decommission Date</label>
            <input type="date" value={form.decommissioned_at} onChange={set('decommissioned_at')} className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Warranty Period (months)</label>
            <input type="number" min="0" value={form.warranty_months} onChange={set('warranty_months')} placeholder="e.g., 36" className={inputClass} disabled={saving} />
          </div>

          <div>
            <label className={labelClass}>Warranty End Date</label>
            <input type="date" value={form.warranty_end} onChange={set('warranty_end')} className={inputClass} disabled={saving} />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Condition, issues..." className={inputClass} disabled={saving} />
          </div>

          {needsStockLot && (
            <StockLotFields
              lots={lotOptions}
              lotId={lotId}
              skipLot={skipLot}
              onLotId={(id) => {
                setLotTouched(true)
                setSkipLot(false)
                setLotId(id)
              }}
              onSkip={(skip) => {
                setSkipLot(skip)
                if (skip) {
                  setLotId('')
                  setChargeOffice('')
                }
              }}
              chargeOffices={chargeOffices}
              chargeOffice={chargeOffice}
              onChargeOffice={setChargeOffice}
              disabled={saving}
              showCharge={assigningPerson}
              hint={
                device?.not_from_stock
                  ? 'This PC is marked Not from stock. Leave that checked, or pick a lot if it should be charged.'
                  : assigningPerson
                    ? undefined
                    : 'Pick which purchase lot this PC came from. Charge to is asked when someone is assigned.'
              }
            />
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.asset_type}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              device ? 'Save Changes' : 'Add Device'
            )}
          </button>
        </div>
      </div>
      {legacyLotPrompt && (
        <StockLotPromptDialog
          candidates={legacyLotPrompt.candidates}
          saving={legacyLotSaving}
          chargeOffices={chargeOffices}
          onConfirmLot={async (lotId, office) => {
            setLegacyLotSaving(true)
            setError(null)
            try {
              const res = await fetch(`/api/stock/allocations/${legacyLotPrompt.allocation_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lot_id: lotId, charge_office: office }),
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data.error || 'Failed to attach lot')
              setLegacyLotPrompt(null)
              onSaved(legacyLotPrompt.device)
            } catch (e: any) {
              setError(e.message)
            } finally {
              setLegacyLotSaving(false)
            }
          }}
          onNotFromStock={async () => {
            setLegacyLotSaving(true)
            setError(null)
            try {
              const res = await fetch(`/api/stock/allocations/${legacyLotPrompt.allocation_id}`, {
                method: 'DELETE',
              })
              if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || 'Failed to mark Not from stock')
              }
              setLegacyLotPrompt(null)
              onSaved(legacyLotPrompt.device)
            } catch (e: any) {
              setError(e.message)
            } finally {
              setLegacyLotSaving(false)
            }
          }}
        />
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, Loader2, Plus, Trash2, X } from 'lucide-react'
import { formatMakeModel, officeNameToLocation } from '@/lib/devices'

export interface EmployeeEditValues {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  job_title: string | null
  department: string | null
  office_location: string | null
  phone_number: string | null
  extension: string | null
  username: string | null
  employment_status: string
}

interface FormState {
  email: string
  first_name: string
  last_name: string
  display_name: string
  job_title: string
  department: string
  office_location: string
  phone_number: string
  extension: string
  username: string
}

interface AssignedDevice {
  id: string
  device_name: string | null
  asset_tag: string | null
  serial_number: string | null
  asset_type: string | null
  manufacturer: string | null
  model: string | null
  status: string | null
}

interface AssignableDevice {
  id: string
  device_name: string | null
  asset_tag: string | null
  serial_number: string | null
  asset_type: string | null
  manufacturer: string | null
  model: string | null
  status: string | null
  employee_id: string | null
}

function toForm(employee: EmployeeEditValues): FormState {
  return {
    email: employee.email || '',
    first_name: employee.first_name || '',
    last_name: employee.last_name || '',
    display_name: employee.display_name || '',
    job_title: employee.job_title || '',
    department: employee.department || '',
    office_location: employee.office_location || '',
    phone_number: employee.phone_number || '',
    extension: employee.extension || '',
    username: employee.username || '',
  }
}

function deviceLabel(d: {
  device_name: string | null
  asset_tag: string | null
  serial_number: string | null
  manufacturer?: string | null
  model?: string | null
}): string {
  const name = d.device_name || formatMakeModel(d.manufacturer, d.model) || 'Unnamed device'
  const tag = d.asset_tag ? ` · ${d.asset_tag}` : ''
  const serial = d.serial_number ? ` · ${d.serial_number}` : ''
  return `${name}${tag}${serial}`
}

interface EmployeeFormModalProps {
  employee: EmployeeEditValues
  onSaved: (employee: EmployeeEditValues) => void
  onDeleted?: () => void
  onDevicesChanged?: () => void
  onClose: () => void
}

export default function EmployeeFormModal({
  employee,
  onSaved,
  onDeleted,
  onDevicesChanged,
  onClose,
}: EmployeeFormModalProps) {
  const [form, setForm] = useState<FormState>(() => toForm(employee))
  const [displayNameTouched, setDisplayNameTouched] = useState(false)
  const [locations, setLocations] = useState<string[]>([])
  const [assigned, setAssigned] = useState<AssignedDevice[]>([])
  const [assignable, setAssignable] = useState<AssignableDevice[]>([])
  const [devicesLoading, setDevicesLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [unassigningId, setUnassigningId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true)
    try {
      const [empRes, devicesRes] = await Promise.all([
        fetch(`/api/employees/${employee.id}`, { cache: 'no-store' }),
        fetch('/api/devices', { cache: 'no-store' }),
      ])
      const empData = await empRes.json()
      const devicesData = await devicesRes.json()

      const current: AssignedDevice[] = empRes.ok
        ? empData.employee?.devices || []
        : []
      setAssigned(current)

      const assignedIds = new Set(current.map((d) => d.id))
      const available = ((devicesData.devices || []) as AssignableDevice[])
        .filter(
          (d) =>
            !assignedIds.has(d.id) &&
            !d.employee_id &&
            d.status !== 'decommissioned'
        )
        .sort((a, b) =>
          deviceLabel(a).localeCompare(deviceLabel(b), undefined, {
            sensitivity: 'base',
          })
        )
      setAssignable(available)
    } catch (e) {
      console.error('Error loading devices for employee:', e)
    } finally {
      setDevicesLoading(false)
    }
  }, [employee.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/network/offices', { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        const names: string[] = Array.from(
          new Set((data.offices || []).map((o: any) => officeNameToLocation(o.name)))
        )
        if (!names.includes('Remote')) names.push('Remote')
        names.sort()
        setLocations(names)
      } catch (e) {
        console.error('Error loading office locations:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  useEffect(() => {
    if (!pickerOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pickerOpen])

  const filteredAssignable = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return assignable.slice(0, 80)
    return assignable
      .filter((d) => {
        const hay = [
          d.device_name,
          d.asset_tag,
          d.serial_number,
          d.manufacturer,
          d.model,
          d.asset_type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 80)
  }, [assignable, pickerQuery])

  const setField = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.value
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (
        !displayNameTouched &&
        (field === 'first_name' || field === 'last_name')
      ) {
        next.display_name = `${next.first_name} ${next.last_name}`.trim()
      }
      return next
    })
  }

  const busy = saving || deleting || !!assigningId || !!unassigningId

  const handleAssign = async (deviceId: string) => {
    if (busy) return
    setAssigningId(deviceId)
    setError(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign device')
      setPickerOpen(false)
      setPickerQuery('')
      await loadDevices()
      onDevicesChanged?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAssigningId(null)
    }
  }

  const handleUnassign = async (device: AssignedDevice) => {
    if (busy) return
    const label = deviceLabel(device)
    if (!confirm(`Unassign ${label} from this employee? Device will return to in stock.`)) {
      return
    }
    setUnassigningId(device.id)
    setError(null)
    try {
      const res = await fetch(
        `/api/employees/${employee.id}/devices/${device.id}`,
        { method: 'DELETE', cache: 'no-store' }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to unassign device')
      await loadDevices()
      onDevicesChanged?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUnassigningId(null)
    }
  }

  const handleSubmit = async () => {
    if (busy) return
    if (!form.email.trim()) {
      setError('Email is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          display_name: form.display_name.trim() || null,
          job_title: form.job_title.trim() || null,
          department: form.department.trim() || null,
          office_location: form.office_location.trim() || null,
          phone_number: form.phone_number.trim() || null,
          extension: form.extension.trim() || null,
          username: form.username.trim() || null,
        }),
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update employee')
      }
      onSaved({
        ...employee,
        ...data.employee,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (busy) return
    const label =
      employee.display_name ||
      [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
      employee.email
    if (
      !confirm(
        `Delete ${label}? Assigned devices will be unassigned and set to in stock. This cannot be undone.`
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'DELETE',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete employee')
      }
      onDeleted?.()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  const locationOptions =
    form.office_location && !locations.includes(form.office_location)
      ? [form.office_location, ...locations]
      : locations

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Employee</h2>
            <p className="text-sm text-gray-500 mt-1">
              Fix typos, and assign or unassign devices
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={busy}
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First Name</label>
            <input
              type="text"
              value={form.first_name}
              onChange={setField('first_name')}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input
              type="text"
              value={form.last_name}
              onChange={setField('last_name')}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => {
                setDisplayNameTouched(true)
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={setField('email')}
              className={inputClass}
              disabled={busy}
            />
            <p className="mt-1 text-xs text-gray-500">
              Changing email also updates the Entra ID link used for matching
            </p>
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              value={form.username}
              onChange={setField('username')}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div>
            <label className={labelClass}>Job Title</label>
            <input
              type="text"
              value={form.job_title}
              onChange={setField('job_title')}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input
              type="text"
              value={form.department}
              onChange={setField('department')}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div>
            <label className={labelClass}>Office / Location</label>
            <select
              value={form.office_location}
              onChange={setField('office_location')}
              className={inputClass}
              disabled={busy}
            >
              <option value="">— None —</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="text"
              value={form.phone_number}
              onChange={setField('phone_number')}
              className={inputClass}
              disabled={busy}
            />
          </div>
          <div>
            <label className={labelClass}>Extension</label>
            <input
              type="text"
              value={form.extension}
              onChange={setField('extension')}
              className={inputClass}
              disabled={busy}
            />
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Devices</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Assign from in-stock inventory or unassign back to stock
              </p>
            </div>
            {!devicesLoading && (
              <span className="text-sm text-gray-500">
                {assigned.length} assigned
              </span>
            )}
          </div>

          {devicesLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading devices…
            </div>
          ) : (
            <>
              {assigned.length === 0 ? (
                <p className="text-sm text-gray-500 mb-3">No devices assigned</p>
              ) : (
                <ul className="space-y-2 mb-3">
                  {assigned.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {d.device_name ||
                            formatMakeModel(d.manufacturer, d.model) ||
                            'Unnamed device'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {[d.asset_type, d.asset_tag, d.serial_number]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnassign(d)}
                        disabled={busy}
                        className="shrink-0 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 rounded-md disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {unassigningId === d.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'Unassign'
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div ref={pickerRef} className="relative">
                <button
                  type="button"
                  disabled={busy || assignable.length === 0}
                  onClick={() => {
                    setPickerOpen((o) => !o)
                    setPickerQuery('')
                  }}
                  className={`${inputClass} flex items-center justify-between text-left bg-white disabled:opacity-50`}
                >
                  <span className="inline-flex items-center gap-2 text-gray-700">
                    <Plus className="w-4 h-4 text-blue-600" />
                    {assignable.length === 0
                      ? 'No unassigned devices available'
                      : 'Assign a device…'}
                  </span>
                  <ChevronsUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
                {pickerOpen && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        autoFocus
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        placeholder="Search name, tag, or serial…"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={busy}
                      />
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {filteredAssignable.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-gray-500">
                          No matches
                        </li>
                      ) : (
                        filteredAssignable.map((d) => (
                          <li key={d.id}>
                            <button
                              type="button"
                              onClick={() => handleAssign(d.id)}
                              disabled={busy}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-900 disabled:opacity-50"
                            >
                              <span className="block truncate font-medium">
                                {assigningId === d.id ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Assigning…
                                  </span>
                                ) : (
                                  d.device_name ||
                                  formatMakeModel(d.manufacturer, d.model) ||
                                  'Unnamed device'
                                )}
                              </span>
                              <span className="block truncate text-xs text-gray-500">
                                {[d.asset_type, d.asset_tag, d.serial_number, d.status]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="px-4 py-2 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
          <div className="flex gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !form.email.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronsUpDown, Loader2, X } from 'lucide-react'
import {
  ASSET_TYPE_LABELS,
  DEPARTMENTS,
  DEVICE_STATUS_FILTERS,
  DEVICE_STATUS_FILTER_LABELS,
  applyStatusSelect,
  deviceTypeSelectOptions,
  statusSelectValue,
} from '@/lib/devices'
import { StockLotFields } from '@/components/stock/StockLotFields'
import { candidateLotsForPrompt, isStockAssetType, pickFifoLot, type LotWithMetrics } from '@/lib/stock-tracker'
import { defaultLoanerDueDate } from '@/lib/loaner-checkout'
import {
  EMPLOYEE_REVIEW_KINDS,
  REVIEW_KIND_LABELS,
  isDeviceReviewKind,
  isLotReviewKind,
  remainingSyncReviewItems,
  type OnboardingSyncResult,
  type SyncReviewDraft,
  type SyncReviewItem,
} from '@/lib/sync-review'

interface AvailableDevice {
  id: string
  device_name: string | null
  serial_number: string | null
  manufacturer: string | null
  model: string | null
  asset_type: string | null
  status: string | null
}

interface EmployeeOption {
  id: string
  display_name: string | null
  email: string | null
}

interface SyncReviewModalProps {
  result: OnboardingSyncResult
  locations: string[]
  initialDrafts?: Record<string, SyncReviewDraft>
  onSavePending: (remaining: SyncReviewItem[], drafts: Record<string, SyncReviewDraft>) => void
  onDefer: (remaining: SyncReviewItem[], drafts: Record<string, SyncReviewDraft>) => void
  onComplete: () => void
}

function kindBadgeClass(kind: SyncReviewItem['kind']): string {
  switch (kind) {
    case 'device_created':
    case 'ninja_new':
      return 'bg-blue-100 text-blue-800'
    case 'device_assigned':
      return 'bg-emerald-100 text-emerald-800'
    case 'device_returned':
      return 'bg-amber-100 text-amber-800'
    case 'device_pending':
      return 'bg-orange-100 text-orange-800'
    case 'employee_onboarded':
      return 'bg-green-100 text-green-800'
    case 'employee_offboarded':
      return 'bg-gray-200 text-gray-700'
    case 'employee_updated':
      return 'bg-violet-100 text-violet-800'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function showsLotFields(item: SyncReviewItem, draft?: SyncReviewDraft): boolean {
  if (!isLotReviewKind(item.kind)) return false
  if (item.kind === 'device_pending') return true
  const type = draft?.asset_type || item.asset_type
  return isStockAssetType(type)
}

function reviewNeedsChargeOffice(
  item: SyncReviewItem,
  draft: SyncReviewDraft,
  showLot: boolean
): boolean {
  if (!showLot || draft.skip_lot || !draft.lot_id) return false
  if (item.kind === 'ninja_new') return Boolean(draft.employee_id)
  if (item.kind === 'device_pending') return true
  return Boolean(item.employee_id)
}

function buildDrafts(
  items: SyncReviewItem[],
  saved: Record<string, SyncReviewDraft> | undefined
): Record<string, SyncReviewDraft> {
  const drafts: Record<string, SyncReviewDraft> = {}
  for (const item of items) {
    const savedDraft = saved?.[item.id]
        drafts[item.id] = savedDraft
      ? {
          ...savedDraft,
          charge_office: savedDraft.charge_office || '',
          employee_id: savedDraft.employee_id || '',
          job_title:
            savedDraft.job_title ||
            item.proposed_job_title ||
            item.job_title ||
            '',
          office_location:
            savedDraft.office_location ||
            item.proposed_office_location ||
            item.office_location ||
            '',
          department:
            savedDraft.department ||
            item.proposed_department ||
            item.department ||
            '',
        }
      : {
          asset_type: item.asset_type || '',
          status: item.kind === 'ninja_new' ? 'in_stock' : item.status || 'in_stock',
          department:
            item.kind === 'employee_updated'
              ? item.proposed_department || item.department || ''
              : item.department || '',
          location: item.location || '',
          is_loaner: Boolean(item.is_loaner),
          lot_id: item.not_from_stock ? '' : item.stock_lot?.selected_lot_id || '',
          skip_lot: Boolean(item.not_from_stock),
          charge_office: '',
          pending_device_id: '',
          employee_id: item.employee_id || '',
          job_title: item.proposed_job_title || item.job_title || '',
          office_location: item.proposed_office_location || item.office_location || '',
        }
  }
  return drafts
}

async function applyLotChoice(opts: {
  allocationId?: string | null
  deviceId: string
  employeeId?: string | null
  lotId: string
  skipLot: boolean
  chargeOffice: string
}): Promise<void> {
  if (opts.skipLot) {
    if (opts.allocationId) {
      const delRes = await fetch(`/api/stock/allocations/${opts.allocationId}`, {
        method: 'DELETE',
      })
      if (!delRes.ok) {
        const lotData = await delRes.json().catch(() => ({}))
        throw new Error(lotData.error || 'Failed to remove purchase lot charge')
      }
      return
    }
    const skipRes = await fetch('/api/stock/allocations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: opts.deviceId,
        not_from_stock: true,
      }),
    })
    if (!skipRes.ok) {
      const lotData = await skipRes.json().catch(() => ({}))
      throw new Error(lotData.error || 'Failed to mark Not from stock')
    }
    return
  }
  if (!opts.lotId) return
  if (opts.allocationId) {
    const lotRes = await fetch(`/api/stock/allocations/${opts.allocationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot_id: opts.lotId, charge_office: opts.chargeOffice }),
    })
    if (!lotRes.ok) {
      const lotData = await lotRes.json().catch(() => ({}))
      throw new Error(lotData.error || 'Failed to attach purchase lot')
    }
    return
  }
  const createRes = await fetch('/api/stock/allocations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: opts.deviceId,
      employee_id: opts.employeeId || undefined,
      lot_id: opts.lotId,
      charge_office: opts.chargeOffice,
    }),
  })
  if (!createRes.ok) {
    const lotData = await createRes.json().catch(() => ({}))
    throw new Error(lotData.error || 'Failed to attach purchase lot')
  }
}

export default function SyncReviewModal({
  result,
  locations,
  initialDrafts,
  onSavePending,
  onDefer,
  onComplete,
}: SyncReviewModalProps) {
  const items = result.review?.items ?? []
  const [index, setIndex] = useState(0)
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set())
  const [drafts, setDrafts] = useState<Record<string, SyncReviewDraft>>(() =>
    buildDrafts(items, initialDrafts)
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [available, setAvailable] = useState<AvailableDevice[]>([])
  const [clientLots, setClientLots] = useState<LotWithMetrics[]>([])
  const [chargeOffices, setChargeOffices] = useState<string[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [assigneeOpen, setAssigneeOpen] = useState(false)
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const assigneeBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/devices/available')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAvailable(data.devices || [])
      })
      .catch(() => {
        if (!cancelled) setAvailable([])
      })
    fetch('/api/stock/lots')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setClientLots(data.lots || [])
          setChargeOffices(data.charge_offices || [])
        }
      })
      .catch(() => {
        if (!cancelled) setClientLots([])
      })
    fetch('/api/employees?status=active', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setEmployees(
            (data.employees || []).map((e: EmployeeOption) => ({
              id: e.id,
              display_name: e.display_name,
              email: e.email,
            }))
          )
        }
      })
      .catch(() => {
        if (!cancelled) setEmployees([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const item = items[index]
  const draft = item ? drafts[item.id] : undefined
  const isLast = index === items.length - 1
  const stats = result.stats || {}
  const showLot = item ? showsLotFields(item, draft) : false
  const needsCharge = item && draft ? reviewNeedsChargeOffice(item, draft, showLot) : false
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === draft?.employee_id) || null,
    [employees, draft?.employee_id]
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

  const lotOptions = useMemo(() => {
    if (!item) return []
    const fromItem = item.stock_lot?.candidates || []
    if (fromItem.length > 0) return fromItem
    return candidateLotsForPrompt(clientLots, {
      asset_type: draft?.asset_type || item.asset_type,
      manufacturer: item.manufacturer,
      model: item.model,
    })
  }, [item, draft?.asset_type, clientLots])

  const updateDraft = (id: string, patch: Partial<SyncReviewDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  useEffect(() => {
    setAssigneeOpen(false)
    setAssigneeQuery('')
  }, [item?.id])

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

  useEffect(() => {
    if (!item || !draft) return
    if (!showsLotFields(item, draft) || draft.skip_lot || draft.lot_id) return
    const fifo = pickFifoLot(clientLots, {
      asset_type: draft.asset_type || item.asset_type,
      manufacturer: item.manufacturer,
      model: item.model,
    })
    if (fifo) updateDraft(item.id, { lot_id: fifo.id })
  }, [clientLots, item, draft])

  const remainder = (confirmedIds: Iterable<string>) =>
    remainingSyncReviewItems(items, confirmedIds)

  const finishLater = () => {
    onDefer(remainder(confirmed), drafts)
  }

  const validationError = useMemo(() => {
    if (!item || !draft) return null
    if (item.kind === 'device_pending' && !draft.pending_device_id) {
      return 'Pick which in-stock PC to assign to this hire.'
    }
    const skipLot = draft.skip_lot
    if (showLot && !skipLot && !draft.lot_id) {
      return 'Pick which purchase lot this came from, or check “Not from stock” if it did not come from a purchase lot.'
    }
    if (showLot && !skipLot && draft.lot_id && needsCharge && !draft.charge_office) {
      return 'Pick which office to charge'
    }
    return null
  }, [item, draft, showLot, needsCharge])

  const confirmCurrent = async () => {
    if (!item || !draft) return
    if (validationError) {
      setSaveError(validationError)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (item.kind === 'employee_updated') {
        const jobTitle = (draft.job_title || item.proposed_job_title || '').trim() || null
        const officeLocation =
          (draft.office_location || item.proposed_office_location || '').trim() || null
        const department =
          (draft.department || item.proposed_department || '').trim() || null
        const res = await fetch(`/api/employees/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_title: jobTitle,
            office_location: officeLocation,
            department,
            azure_ack: {
              job_title: item.azure_job_title ?? item.proposed_job_title ?? null,
              office_location: item.azure_office_location ?? item.proposed_office_location ?? null,
              department: item.azure_department ?? item.proposed_department ?? null,
            },
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to update employee')
      } else if (item.kind === 'device_pending') {
        if (!item.employee_id || !draft.pending_device_id) {
          throw new Error('Pick an in-stock device')
        }
        const assignRes = await fetch(`/api/employees/${item.employee_id}/devices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: draft.pending_device_id,
            lot_id: draft.skip_lot ? null : draft.lot_id || null,
            not_from_stock: draft.skip_lot,
            charge_office: draft.charge_office || null,
          }),
        })
        const assignData = await assignRes.json()
        if (!assignRes.ok) throw new Error(assignData.error || 'Failed to assign device')
        const allocationId = assignData.stock_lot?.allocation_id as string | undefined
        if (showLot) {
          await applyLotChoice({
            allocationId,
            deviceId: draft.pending_device_id,
            employeeId: item.employee_id,
            lotId: draft.lot_id,
            skipLot: draft.skip_lot,
            chargeOffice: draft.charge_office,
          })
        }
      } else if (isDeviceReviewKind(item.kind)) {
        const orig = item
        const nextEmployeeId =
          item.kind === 'ninja_new' ? draft.employee_id || null : orig.employee_id || null
        const dirty =
          draft.asset_type !== (orig.asset_type || '') ||
          draft.status !== (orig.status || 'in_stock') ||
          draft.department !== (orig.department || '') ||
          draft.location !== (orig.location || '') ||
          draft.is_loaner !== Boolean(orig.is_loaner) ||
          (item.kind === 'ninja_new' && (draft.employee_id || '') !== (orig.employee_id || ''))
        const payload: Record<string, unknown> = {
          asset_type: draft.asset_type || null,
          status: draft.status || 'in_stock',
          department: draft.department || null,
          location: draft.location || null,
          is_loaner: draft.is_loaner,
        }
        if (item.kind === 'ninja_new') {
          payload.employee_id = nextEmployeeId
          if (draft.is_loaner && nextEmployeeId) {
            payload.loaner_due_date = defaultLoanerDueDate()
          }
          if (showLot) {
            payload.not_from_stock = draft.skip_lot
            payload.lot_id = draft.skip_lot ? null : draft.lot_id || null
            payload.charge_office = draft.skip_lot ? null : draft.charge_office || null
          }
        }
        if (dirty || (item.kind === 'ninja_new' && showLot)) {
          const res = await fetch(`/api/devices/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || 'Failed to update device')
          }
        }
        if (showLot && item.kind !== 'ninja_new') {
          await applyLotChoice({
            allocationId: item.stock_lot?.allocation_id,
            deviceId: item.id,
            employeeId: orig.employee_id,
            lotId: draft.lot_id,
            skipLot: draft.skip_lot,
            chargeOffice: draft.charge_office,
          })
        }
      }

      const nextConfirmed = new Set(confirmed)
      nextConfirmed.add(item.id)
      setConfirmed(nextConfirmed)
      const leftover = remainder(nextConfirmed)
      if (leftover.length === 0) {
        onComplete()
      } else {
        onSavePending(leftover, drafts)
        setIndex((i) => i + 1)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save this entry')
    } finally {
      setSaving(false)
    }
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Confirm sync change</h2>
            <p className="text-sm text-gray-600 mt-1">
              {index + 1} of {items.length}
              {' · '}
              {(stats.onboarded ?? 0) + (stats.offboarded ?? 0)} people ·{' '}
              {stats.devicesAssigned ?? 0} assigned
              {(result.errors?.length ?? 0) > 0 && ` · ${result.errors!.length} warnings`}
            </p>
          </div>
          <button
            type="button"
            onClick={finishLater}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {item && draft && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900 text-lg">{item.label}</p>
                  {item.kind === 'ninja_new' && (
                    <p className="text-sm text-gray-600 mt-0.5">
                      Unassigned inventory from NinjaOne. The title is the device hostname, not a
                      hire. Leave unassigned or assign to an existing person. Pick a purchase lot,
                      or Not from stock for a one-time buy (no accounting report). Charge to is
                      asked when someone is assigned from stock.
                    </p>
                  )}
                  {item.employee_name && (
                    <p className="text-sm text-gray-600 mt-0.5">{item.employee_name}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {[item.serial_number, item.manufacturer, item.model].filter(Boolean).join(' · ') ||
                      (item.kind === 'device_pending'
                        ? 'Not in NinjaOne — pick an in-stock PC and a purchase lot.'
                        : '—')}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${kindBadgeClass(item.kind)}`}
                >
                  {REVIEW_KIND_LABELS[item.kind]}
                </span>
              </div>

              {item.kind === 'employee_updated' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Azure AD has a different job title, office, or department than EMS. Confirm
                    saves the fields below. If you keep EMS values, this Azure snapshot will not
                    come back until Azure itself changes.
                  </p>
                  {(item.job_title || item.office_location || item.department) && (
                    <p className="text-xs text-gray-500">
                      Current:{' '}
                      {[
                        item.job_title || 'no title',
                        item.department || 'no department',
                        item.office_location || 'no office',
                      ].join(' · ')}
                    </p>
                  )}
                  <label className="block text-sm text-gray-700">
                    Job title
                    <input
                      type="text"
                      value={draft.job_title}
                      onChange={(e) => updateDraft(item.id, { job_title: e.target.value })}
                      disabled={saving}
                      className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </label>
                  <label className="block text-sm text-gray-700">
                    Department
                    <select
                      value={draft.department}
                      onChange={(e) => updateDraft(item.id, { department: e.target.value })}
                      disabled={saving}
                      className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="">— None —</option>
                      {(draft.department && !(DEPARTMENTS as readonly string[]).includes(draft.department)
                        ? [draft.department, ...DEPARTMENTS]
                        : DEPARTMENTS
                      ).map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-700">
                    Office / Location
                    <select
                      value={draft.office_location}
                      onChange={(e) => updateDraft(item.id, { office_location: e.target.value })}
                      disabled={saving}
                      className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="">— None —</option>
                      {(draft.office_location && !locations.includes(draft.office_location)
                        ? [draft.office_location, ...locations]
                        : locations
                      ).map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {EMPLOYEE_REVIEW_KINDS.includes(item.kind) && item.kind !== 'employee_updated' && (
                <p className="text-sm text-gray-600">
                  Confirm this employee change, or go back to the previous item.
                </p>
              )}

              {item.kind === 'device_pending' && (
                <label className="block text-sm text-gray-700">
                  In-stock PC to assign
                  <select
                    value={draft.pending_device_id}
                    onChange={(e) => updateDraft(item.id, { pending_device_id: e.target.value })}
                    disabled={saving}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="">Select a device…</option>
                    {available.length === 0 && (
                      <option value="" disabled>
                        No unassigned PCs in inventory
                      </option>
                    )}
                    {available.map((d) => (
                      <option key={d.id} value={d.id}>
                        {[d.serial_number, d.device_name, d.manufacturer, d.model]
                          .filter(Boolean)
                          .join(' · ') || d.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {isDeviceReviewKind(item.kind) && item.kind !== 'device_pending' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-gray-600">
                    Asset type
                    <select
                      value={draft.asset_type}
                      onChange={(e) => {
                        const asset_type = e.target.value
                        const patch: Partial<SyncReviewDraft> = { asset_type }
                        if (isStockAssetType(asset_type) && !draft.skip_lot && !draft.lot_id) {
                          const fifo = pickFifoLot(clientLots, {
                            asset_type,
                            manufacturer: item.manufacturer,
                            model: item.model,
                          })
                          if (fifo) patch.lot_id = fifo.id
                        }
                        if (!isStockAssetType(asset_type)) {
                          patch.lot_id = ''
                          patch.skip_lot = false
                        }
                        updateDraft(item.id, patch)
                      }}
                      disabled={saving}
                      className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="">— None —</option>
                      {deviceTypeSelectOptions(draft.asset_type).map((t) => (
                        <option key={t} value={t}>
                          {ASSET_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-gray-600">
                    Status
                    <select
                      value={statusSelectValue(draft.status, draft.is_loaner)}
                      onChange={(e) => {
                        const next = applyStatusSelect(e.target.value, Boolean(draft.employee_id))
                        updateDraft(item.id, { status: next.status, is_loaner: next.is_loaner })
                      }}
                      disabled={saving}
                      className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      {DEVICE_STATUS_FILTERS.map((s) => (
                        <option key={s} value={s}>
                          {DEVICE_STATUS_FILTER_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {item.kind === 'ninja_new' && (
                    <div className="sm:col-span-2" ref={assigneeBoxRef}>
                      <p className="text-xs text-gray-600">Assigned user</p>
                      <div className="relative mt-1">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setAssigneeOpen((o) => !o)
                            setAssigneeQuery('')
                          }}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white flex items-center justify-between text-left disabled:opacity-50"
                        >
                          <span className={selectedEmployee ? 'text-gray-900' : 'text-gray-500'}>
                            {selectedEmployee
                              ? selectedEmployee.display_name || selectedEmployee.email || 'Assigned'
                              : 'Unassigned'}
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
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                                disabled={saving}
                              />
                            </div>
                            <ul className="max-h-48 overflow-y-auto py-1">
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = applyStatusSelect(
                                      statusSelectValue(draft.status, draft.is_loaner),
                                      false
                                    )
                                    updateDraft(item.id, {
                                      employee_id: '',
                                      status: draft.is_loaner ? 'in_stock' : draft.status,
                                      is_loaner: next.is_loaner,
                                    })
                                    setAssigneeOpen(false)
                                    setAssigneeQuery('')
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                                    !draft.employee_id
                                      ? 'bg-blue-50 text-blue-800 font-medium'
                                      : 'text-gray-700'
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
                                      onClick={() => {
                                        const next = applyStatusSelect(
                                          statusSelectValue(draft.status, draft.is_loaner),
                                          true
                                        )
                                        updateDraft(item.id, {
                                          employee_id: e.id,
                                          status: draft.is_loaner
                                            ? 'active'
                                            : draft.status === 'in_stock'
                                              ? 'active'
                                              : draft.status,
                                          is_loaner: next.is_loaner,
                                        })
                                        setAssigneeOpen(false)
                                        setAssigneeQuery('')
                                      }}
                                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                                        draft.employee_id === e.id
                                          ? 'bg-blue-50 text-blue-800 font-medium'
                                          : 'text-gray-900'
                                      }`}
                                    >
                                      <span className="block truncate">
                                        {e.display_name || e.email || e.id}
                                      </span>
                                      {e.display_name && e.email && (
                                        <span className="block truncate text-xs text-gray-500">
                                          {e.email}
                                        </span>
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
                  )}
                  <label className="text-xs text-gray-600">
                    Department
                    <select
                      value={draft.department}
                      onChange={(e) => updateDraft(item.id, { department: e.target.value })}
                      disabled={saving}
                      className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="">— None —</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-gray-600">
                    Location (office)
                    <select
                      value={draft.location}
                      onChange={(e) => updateDraft(item.id, { location: e.target.value })}
                      disabled={saving}
                      className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                    >
                      <option value="">— None —</option>
                      {locations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {showLot && (
                <StockLotFields
                  lots={lotOptions}
                  lotId={draft.lot_id}
                  skipLot={draft.skip_lot}
                  onLotId={(id) => updateDraft(item.id, { lot_id: id, skip_lot: false })}
                  onSkip={(skip) =>
                    updateDraft(item.id, {
                      skip_lot: skip,
                      lot_id: skip ? '' : draft.lot_id,
                      charge_office: skip ? '' : draft.charge_office,
                    })
                  }
                  chargeOffices={chargeOffices}
                  chargeOffice={draft.charge_office}
                  onChargeOffice={(office) => updateDraft(item.id, { charge_office: office })}
                  disabled={saving}
                  allowSkip
                  showCharge={needsCharge}
                  hint={
                    item.kind === 'ninja_new'
                      ? draft.employee_id
                        ? 'Assigning from Admin stock needs a lot and Charge to. Check Not from stock for a one-time buy for this person (no report).'
                        : 'Pick a purchase lot, or Not from stock if this is not closet inventory. Charge to is asked when someone is assigned from stock.'
                      : item.stock_lot?.determined
                        ? 'Oldest matching open lot is selected. Confirm, pick another matching buy, or check Not from stock.'
                        : 'Pick which purchase lot this came from, or check Not from stock.'
                  }
                />
              )}
            </>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={() => {
              setSaveError(null)
              setIndex((i) => Math.max(0, i - 1))
            }}
            disabled={saving || index === 0}
            className="inline-flex items-center gap-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finishLater}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Finish later
            </button>
            <button
              type="button"
              onClick={confirmCurrent}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : isLast ? (
                'Confirm & done'
              ) : (
                'Confirm & next'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

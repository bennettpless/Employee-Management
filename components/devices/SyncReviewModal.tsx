'use client'

import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  DEPARTMENTS,
  DEVICE_STATUSES,
  DEVICE_STATUS_LABELS,
} from '@/lib/devices'
import {
  EMPLOYEE_REVIEW_KINDS,
  REVIEW_KIND_LABELS,
  isDeviceReviewKind,
  type OnboardingSyncResult,
  type SyncReviewItem,
} from '@/lib/sync-review'

interface DeviceDraft {
  asset_type: string
  status: string
  department: string
  location: string
}

interface SyncReviewModalProps {
  result: OnboardingSyncResult
  locations: string[]
  onClose: () => void
  onSaved: () => void
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
    case 'employee_onboarded':
      return 'bg-green-100 text-green-800'
    case 'employee_offboarded':
      return 'bg-gray-200 text-gray-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function buildDrafts(items: SyncReviewItem[]): Record<string, DeviceDraft> {
  const drafts: Record<string, DeviceDraft> = {}
  for (const item of items) {
    if (!isDeviceReviewKind(item.kind)) continue
    drafts[item.id] = {
      asset_type: item.asset_type || '',
      status: item.status || 'in_stock',
      department: item.department || '',
      location: item.location || '',
    }
  }
  return drafts
}

export default function SyncReviewModal({
  result,
  locations,
  onClose,
  onSaved,
}: SyncReviewModalProps) {
  const items = result.review?.items ?? []
  const [drafts, setDrafts] = useState<Record<string, DeviceDraft>>(() =>
    buildDrafts(items)
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const employeeItems = useMemo(
    () => items.filter((i) => EMPLOYEE_REVIEW_KINDS.includes(i.kind)),
    [items]
  )
  const deviceItems = useMemo(
    () => items.filter((i) => isDeviceReviewKind(i.kind)),
    [items]
  )

  const dirtyDeviceIds = useMemo(() => {
    const dirty: string[] = []
    for (const item of deviceItems) {
      const draft = drafts[item.id]
      if (!draft) continue
      const origType = item.asset_type || ''
      const origStatus = item.status || 'in_stock'
      const origDept = item.department || ''
      const origLoc = item.location || ''
      if (
        draft.asset_type !== origType ||
        draft.status !== origStatus ||
        draft.department !== origDept ||
        draft.location !== origLoc
      ) {
        dirty.push(item.id)
      }
    }
    return dirty
  }, [deviceItems, drafts])

  const updateDraft = (id: string, field: keyof DeviceDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleSave = async () => {
    if (dirtyDeviceIds.length === 0) {
      onSaved()
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const failures: string[] = []
      await Promise.all(
        dirtyDeviceIds.map(async (id) => {
          const draft = drafts[id]
          const res = await fetch(`/api/devices/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              asset_type: draft.asset_type || null,
              status: draft.status || 'in_stock',
              department: draft.department || null,
              location: draft.location || null,
            }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            failures.push(data.error || `Failed to update device ${id}`)
          }
        })
      )
      if (failures.length > 0) {
        setSaveError(failures.slice(0, 5).join('; '))
        return
      }
      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const stats = result.stats || {}

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Sync review</h2>
            <p className="text-sm text-gray-600 mt-1">
              Completed in {result.duration ?? 0}s · {stats.onboarded ?? 0} onboarded ·{' '}
              {stats.offboarded ?? 0} offboarded · {stats.devicesCreated ?? 0} devices added ·{' '}
              {stats.devicesAssigned ?? 0} assigned · {stats.devicesReturned ?? 0} returned
              {(stats.ninjaNew ?? 0) > 0 && ` · ${stats.ninjaNew} new from NinjaOne`}
              {(stats.devicesPending ?? 0) > 0 &&
                ` · ${stats.devicesPending} waiting on NinjaOne`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {(result.errors?.length ?? 0) > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-amber-800">
                Warnings ({result.errors!.length})
              </summary>
              <ul className="mt-2 text-xs text-amber-900 space-y-0.5 max-h-32 overflow-y-auto">
                {result.errors!.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}

          {employeeItems.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Employees</h3>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {employeeItems.map((item) => (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-white"
                  >
                    <span className="font-medium text-gray-900">{item.label}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${kindBadgeClass(item.kind)}`}
                    >
                      {REVIEW_KIND_LABELS[item.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {deviceItems.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Devices</h3>
              <p className="text-xs text-gray-500 mb-2">
                Adjust asset type, status, department, or location below, then save.
              </p>
              <div className="space-y-3">
                {deviceItems.map((item) => {
                  const draft = drafts[item.id]
                  if (!draft) return null
                  const makeModel = [item.manufacturer, item.model].filter(Boolean).join(' ')
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className="border border-gray-200 rounded-lg p-3 bg-white"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-medium text-gray-900">{item.label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[item.serial_number, makeModel, item.employee_name]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${kindBadgeClass(item.kind)}`}
                        >
                          {REVIEW_KIND_LABELS[item.kind]}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <label className="text-xs text-gray-600">
                          Asset type
                          <select
                            value={draft.asset_type}
                            onChange={(e) =>
                              updateDraft(item.id, 'asset_type', e.target.value)
                            }
                            disabled={saving}
                            className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                          >
                            <option value="">— None —</option>
                            {ASSET_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {ASSET_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs text-gray-600">
                          Status
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              updateDraft(item.id, 'status', e.target.value)
                            }
                            disabled={saving}
                            className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                          >
                            {DEVICE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {DEVICE_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs text-gray-600">
                          Department
                          <select
                            value={draft.department}
                            onChange={(e) =>
                              updateDraft(item.id, 'department', e.target.value)
                            }
                            disabled={saving}
                            className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                          >
                            <option value="">— None —</option>
                            {DEPARTMENTS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                            {draft.department &&
                              !(DEPARTMENTS as readonly string[]).includes(
                                draft.department
                              ) && (
                                <option value={draft.department}>
                                  ⚠ {draft.department}
                                </option>
                              )}
                          </select>
                        </label>
                        <label className="text-xs text-gray-600">
                          Location
                          <select
                            value={draft.location}
                            onChange={(e) =>
                              updateDraft(item.id, 'location', e.target.value)
                            }
                            disabled={saving}
                            className="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
                          >
                            <option value="">— None —</option>
                            {locations.map((loc) => (
                              <option key={loc} value={loc}>
                                {loc}
                              </option>
                            ))}
                            {draft.location && !locations.includes(draft.location) && (
                              <option value={draft.location}>
                                ⚠ {draft.location}
                              </option>
                            )}
                          </select>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : (
            <p className="text-sm text-gray-500">
              No device changes in this sync
              {employeeItems.length === 0 ? ' (and no employee changes either).' : '.'}
            </p>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {dirtyDeviceIds.length > 0 ? 'Skip' : 'Done'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || dirtyDeviceIds.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              `Save changes${dirtyDeviceIds.length > 0 ? ` (${dirtyDeviceIds.length})` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

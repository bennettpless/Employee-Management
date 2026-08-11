'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Server, Loader2, Monitor, Laptop, Tv, Printer, HardDrive,
  Search, Plus, RefreshCw, ChevronUp, ChevronDown, AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import { Device } from '@/lib/types'
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  DEVICE_STATUSES,
  DEVICE_STATUS_LABELS,
  formatMakeModel,
} from '@/lib/devices'
import type { OnboardingSyncResult } from '@/lib/sync-review'
import DeviceFormModal from '@/components/devices/DeviceFormModal'
import SyncReviewModal from '@/components/devices/SyncReviewModal'

type SortKey = 'device_name' | 'asset_tag' | 'asset_type' | 'make_model' | 'serial_number' | 'assigned' | 'department' | 'location' | 'status' | 'warranty_end'

const statusBadgeClass: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  in_stock: 'bg-blue-100 text-blue-800',
  repair: 'bg-amber-100 text-amber-800',
  decommissioned: 'bg-gray-200 text-gray-700',
}

function getDeviceIcon(assetType: string | null) {
  switch (assetType) {
    case 'laptop': return <Laptop className="w-4 h-4 text-blue-600" />
    case 'desktop': return <Monitor className="w-4 h-4 text-indigo-600" />
    case 'monitor': return <Monitor className="w-4 h-4 text-cyan-600" />
    case 'tv': return <Tv className="w-4 h-4 text-purple-600" />
    case 'printer': return <Printer className="w-4 h-4 text-orange-600" />
    case 'server': return <Server className="w-4 h-4 text-red-600" />
    default: return <HardDrive className="w-4 h-4 text-gray-500" />
  }
}

export default function DevicesPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [departments, setDepartments] = useState<string[]>([])
  const [locations, setLocations] = useState<string[]>([])
  // Phase 21: values already present in the DB that fall outside the
  // canonical lists — used to render ⚠ badges on stale rows.
  const [flaggedDepartments, setFlaggedDepartments] = useState<string[]>([])
  const [flaggedLocations, setFlaggedLocations] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('device_name')
  const [sortAsc, setSortAsc] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<OnboardingSyncResult | null>(null)
  const [showSyncReview, setShowSyncReview] = useState(false)

  const fetchDevices = useCallback(async (opts?: { quiet?: boolean }) => {
    try {
      if (!opts?.quiet) setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('asset_type', typeFilter)
      if (departmentFilter) params.set('department', departmentFilter)
      if (locationFilter) params.set('location', locationFilter)
      // Bypass browser / Next fetch cache so edits on /devices/[id] show up
      // immediately when returning to this list.
      const response = await fetch(`/api/devices?${params}`, { cache: 'no-store' })
      const data = await response.json()
      setDevices(data.devices || [])
      setCounts(data.counts || {})
      setTotal(typeof data.total === 'number' ? data.total : 0)
      setDepartments(data.departments || [])
      setLocations(data.locations || [])
      setFlaggedDepartments(data.flaggedDepartments || [])
      setFlaggedLocations(data.flaggedLocations || [])
    } catch (error) {
      console.error('Error fetching devices:', error)
    } finally {
      if (!opts?.quiet) setLoading(false)
    }
  }, [statusFilter, typeFilter, departmentFilter, locationFilter])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Browser back / bfcache can restore this page with stale React state after
  // editing a device on /devices/[id]. Quiet-refetch when the page is shown again.
  useEffect(() => {
    const refresh = () => {
      void fetchDevices({ quiet: true })
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh()
    }
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', refresh)
    }
  }, [fetchDevices])

  const handleOnboardingSync = async () => {
    if (syncing) return
    setSyncing(true)
    setSyncResult(null)
    setShowSyncReview(false)
    try {
      const response = await fetch('/api/sync/onboarding', { method: 'POST' })
      const result: OnboardingSyncResult = await response.json()
      if (!response.ok) throw new Error(result.error || 'Sync failed')
      setSyncResult(result)
      await fetchDevices()
      if ((result.review?.items?.length ?? 0) > 0) {
        setShowSyncReview(true)
      }
    } catch (error: any) {
      alert(`Onboarding/offboarding sync failed: ${error.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const closeSyncReview = async () => {
    setShowSyncReview(false)
    setSyncResult(null)
    await fetchDevices()
  }

  const filteredDevices = useMemo(() => {
    let list = devices
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      list = list.filter((d) => {
        const employeeName = d.employee?.display_name || d.employee?.email || ''
        return (
          (d.asset_tag || '').toLowerCase().includes(q) ||
          (d.serial_number || '').toLowerCase().includes(q) ||
          (d.manufacturer || '').toLowerCase().includes(q) ||
          (d.model || '').toLowerCase().includes(q) ||
          (d.device_name || '').toLowerCase().includes(q) ||
          employeeName.toLowerCase().includes(q)
        )
      })
    }

    const value = (d: Device): string => {
      switch (sortKey) {
        case 'device_name': return d.device_name || ''
        case 'asset_tag': return d.asset_tag || ''
        case 'asset_type': return d.asset_type || ''
        case 'make_model': return formatMakeModel(d.manufacturer, d.model)
        case 'serial_number': return d.serial_number || ''
        case 'assigned': return d.employee?.display_name || d.employee?.email || ''
        case 'department': return d.department || ''
        case 'location': return d.location || ''
        case 'status': return d.status || ''
        case 'warranty_end': return d.warranty_end || ''
      }
    }

    return [...list].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      // Sort blanks last regardless of direction
      if (!va && vb) return 1
      if (va && !vb) return -1
      const cmp = va.localeCompare(vb, undefined, { numeric: true })
      return sortAsc ? cmp : -cmp
    })
  }, [devices, searchTerm, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const hasActiveFilters = Boolean(statusFilter || typeFilter || departmentFilter || locationFilter || searchTerm)

  // Phase 21: O(1) lookups for the per-row ⚠ badges.
  const flaggedDeptSet = useMemo(
    () => new Set(flaggedDepartments),
    [flaggedDepartments]
  )
  const flaggedLocSet = useMemo(
    () => new Set(flaggedLocations),
    [flaggedLocations]
  )
  const flaggedRowCount = useMemo(
    () =>
      devices.filter(
        (d) =>
          (d.department && flaggedDeptSet.has(d.department)) ||
          (d.location && flaggedLocSet.has(d.location))
      ).length,
    [devices, flaggedDeptSet, flaggedLocSet]
  )

  const clearFilters = () => {
    setStatusFilter('')
    setTypeFilter('')
    setDepartmentFilter('')
    setLocationFilter('')
    setSearchTerm('')
  }

  const SortHeader = ({
    label,
    k,
    title,
    className = '',
  }: {
    label: string
    k: SortKey
    title?: string
    className?: string
  }) => (
    <th
      onClick={() => handleSort(k)}
      title={title || label}
      className={`px-2.5 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 overflow-hidden ${className}`}
    >
      <span className="inline-flex items-center gap-1 max-w-full">
        <span className="truncate">{label}</span>
        {sortKey === k && (sortAsc ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />)}
      </span>
    </th>
  )

  const selectClass = 'px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Device Inventory
                {!loading && (
                  <span className="ml-3 text-2xl font-normal text-gray-500">
                    ({filteredDevices.length}
                    {hasActiveFilters ? ` of ${total}` : ''})
                  </span>
                )}
              </h1>
              <p className="text-gray-600">
                Monitors, laptops, desktops, and TVs — who has what, and each device&apos;s status
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOnboardingSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition-colors"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {syncing ? 'Syncing...' : 'Sync Onboarding/Offboarding'}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Device
              </button>
            </div>
          </div>
        </div>

        {/* Compact banner only when sync had no review items (modal handles the happy path) */}
        {syncResult && !showSyncReview && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-green-800 mb-1">
                  Onboarding/offboarding sync complete ({syncResult.duration}s)
                </p>
                <p className="text-green-700">
                  {syncResult.stats?.onboarded ?? 0} onboarded · {syncResult.stats?.offboarded ?? 0} offboarded ·{' '}
                  {syncResult.stats?.devicesCreated ?? 0} devices added · {syncResult.stats?.devicesAssigned ?? 0} assigned ·{' '}
                  {syncResult.stats?.devicesReturned ?? 0} returned to stock
                  {(syncResult.stats?.ninjaNew ?? 0) > 0 && ` · ${syncResult.stats?.ninjaNew} new from NinjaOne`}
                  {(syncResult.stats?.devicesPending ?? 0) > 0 && ` · ${syncResult.stats?.devicesPending} waiting on NinjaOne`}
                </p>
                {(syncResult.errors?.length ?? 0) > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-amber-600 font-medium">
                      View warnings ({syncResult.errors!.length})
                    </summary>
                    <ul className="mt-1 text-xs text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                      {syncResult.errors!.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <button onClick={() => setSyncResult(null)} className="text-green-700 hover:text-green-900 font-bold">✕</button>
            </div>
          </div>
        )}

        {/* Phase 21: cleanup banner for rows with non-canonical department / location values */}
        {flaggedRowCount > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold mb-1">
                  {flaggedRowCount} device{flaggedRowCount === 1 ? '' : 's'} need
                  {flaggedRowCount === 1 ? 's' : ''} cleanup
                </p>
                <p>
                  These devices have a department or location that isn&apos;t one of the
                  canonical options. Click a flagged row to open the device and pick a
                  valid value.
                </p>
                {(flaggedDepartments.length > 0 || flaggedLocations.length > 0) && (
                  <p className="mt-1 text-xs text-amber-800">
                    Out-of-list values found:{' '}
                    {[...flaggedDepartments, ...flaggedLocations]
                      .map((v) => `"${v}"`)
                      .join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status count chips */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
              statusFilter === '' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            All
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-black/10">{counts.all ?? 0}</span>
          </button>
          {DEVICE_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                statusFilter === s ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {DEVICE_STATUS_LABELS[s]}
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-black/10">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search device name, asset tag, serial, model, or user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectClass}>
              <option value="">All Types</option>
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={selectClass}>
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={selectClass}>
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm font-medium text-blue-800"
                  aria-live="polite"
                  title={
                    filteredDevices.length === total
                      ? `Showing all ${total} devices`
                      : `Showing ${filteredDevices.length} of ${total} devices`
                  }
                >
                  <span className="tabular-nums font-semibold">{filteredDevices.length}</span>
                  <span className="text-blue-600">of {total}</span>
                </span>
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors text-sm"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No devices found</h3>
            <p className="text-gray-600">
              {hasActiveFilters
                ? 'No devices match the current filters'
                : 'Add a device or run the onboarding/offboarding sync'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-x-auto">
            {/* min-width keeps every column (incl. Warranty) reachable via horizontal scroll */}
            <table className="w-full min-w-[1080px] table-fixed divide-y divide-gray-200">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[13%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader label="Tag" k="asset_tag" title="Asset Tag" />
                  <SortHeader label="Type" k="asset_type" />
                  <SortHeader label="Make / Model" k="make_model" />
                  <SortHeader label="Device Name" k="device_name" />
                  <SortHeader label="Serial" k="serial_number" />
                  <SortHeader label="Assigned" k="assigned" />
                  <SortHeader label="Dept" k="department" />
                  <SortHeader label="Location" k="location" />
                  <SortHeader label="Status" k="status" />
                  <SortHeader label="Warranty" k="warranty_end" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDevices.map((device) => {
                  const makeModel = formatMakeModel(device.manufacturer, device.model)
                  const typeLabel = device.asset_type
                    ? ASSET_TYPE_LABELS[device.asset_type]
                    : device.device_type || '—'
                  return (
                  <tr
                    key={device.id}
                    onClick={() => router.push(`/devices/${device.id}`)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-2.5 py-2.5 text-sm font-medium text-gray-900 truncate" title={device.asset_tag || undefined}>
                      {device.asset_tag || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-700">
                      <span className="inline-flex items-center gap-1.5 min-w-0" title={typeLabel}>
                        {getDeviceIcon(device.asset_type)}
                        <span className="truncate">{typeLabel}</span>
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-700 truncate" title={makeModel || undefined}>
                      {makeModel || '—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-900 truncate" title={device.device_name || undefined}>
                      {device.device_name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-700 font-mono truncate" title={device.serial_number || undefined}>
                      {device.serial_number || '—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-sm truncate">
                      {device.employee ? (
                        <span
                          className="text-blue-700 font-medium"
                          title={device.employee.display_name || device.employee.email}
                        >
                          {device.employee.display_name || device.employee.email}
                        </span>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-700 truncate">
                      {device.department ? (
                        <span
                          className="inline-flex items-center gap-1 min-w-0"
                          title={
                            flaggedDeptSet.has(device.department)
                              ? 'Not one of the canonical departments — click the row and pick a valid one'
                              : device.department
                          }
                        >
                          <span className="truncate">{device.department}</span>
                          {flaggedDeptSet.has(device.department) && (
                            <AlertTriangle
                              className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
                              aria-label="Non-canonical department"
                            />
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-700 truncate">
                      {device.location ? (
                        <span
                          className="inline-flex items-center gap-1 min-w-0"
                          title={
                            flaggedLocSet.has(device.location)
                              ? 'Not one of the canonical locations — click the row and pick a valid one'
                              : device.location
                          }
                        >
                          <span className="truncate">{device.location}</span>
                          {flaggedLocSet.has(device.location) && (
                            <AlertTriangle
                              className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
                              aria-label="Non-canonical location"
                            />
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <span className={`inline-block max-w-full truncate px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass[device.status] || 'bg-gray-100 text-gray-800'}`}>
                        {DEVICE_STATUS_LABELS[device.status] || device.status}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                      {device.warranty_end ? format(new Date(`${device.warranty_end}T00:00:00`), 'MMM d, yyyy') : '—'}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <DeviceFormModal
          onSaved={() => {
            setShowAddModal(false)
            fetchDevices()
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showSyncReview && syncResult && (
        <SyncReviewModal
          result={syncResult}
          locations={locations}
          onClose={closeSyncReview}
          onSaved={closeSyncReview}
        />
      )}
    </div>
  )
}

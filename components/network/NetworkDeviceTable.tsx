'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Edit2,
  Trash2,
  Loader2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Wifi,
  Router,
  ShieldCheck,
  Server as ServerIcon,
  HardDrive,
  Network as NetworkIcon,
} from 'lucide-react'
import type {
  NetworkDevice,
  NetworkDeviceStatus,
  NetworkDeviceType,
} from '@/lib/types'

type SortKey =
  | 'name'
  | 'device_type'
  | 'manufacturer'
  | 'status'
  | 'last_seen'

interface NetworkDeviceTableProps {
  devices: NetworkDevice[]
  showOfficeColumn?: boolean
  canEdit?: boolean
  onEdit?: (device: NetworkDevice) => void
  onDelete?: (device: NetworkDevice) => void
  deletingId?: string | null
}

export const DEVICE_TYPE_LABEL: Record<NetworkDeviceType, string> = {
  access_point: 'Access Point',
  switch: 'Switch',
  firewall: 'Firewall',
  server: 'Server',
  router: 'Router',
  other: 'Other',
}

export const STATUS_BADGE_CLASS: Record<NetworkDeviceStatus, string> = {
  online: 'bg-green-100 text-green-800 border-green-200',
  offline: 'bg-gray-100 text-gray-700 border-gray-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
}

export function DeviceTypeIcon({
  type,
  className = 'w-4 h-4',
}: {
  type: NetworkDeviceType
  className?: string
}) {
  switch (type) {
    case 'access_point':
      return <Wifi className={className} />
    case 'switch':
      return <NetworkIcon className={className} />
    case 'firewall':
      return <ShieldCheck className={className} />
    case 'server':
      return <ServerIcon className={className} />
    case 'router':
      return <Router className={className} />
    default:
      return <HardDrive className={className} />
  }
}

interface FilterState {
  search: string
  types: Set<NetworkDeviceType>
  statuses: Set<NetworkDeviceStatus>
}

export default function NetworkDeviceTable({
  devices,
  showOfficeColumn = false,
  canEdit = false,
  onEdit,
  onDelete,
  deletingId = null,
}: NetworkDeviceTableProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    types: new Set<NetworkDeviceType>(),
    statuses: new Set<NetworkDeviceStatus>(),
  })
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleType = (t: NetworkDeviceType) => {
    setFilters((prev) => {
      const next = new Set(prev.types)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return { ...prev, types: next }
    })
  }

  const toggleStatus = (s: NetworkDeviceStatus) => {
    setFilters((prev) => {
      const next = new Set(prev.statuses)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return { ...prev, statuses: next }
    })
  }

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return devices.filter((d) => {
      if (filters.types.size > 0 && !filters.types.has(d.device_type)) {
        return false
      }
      if (filters.statuses.size > 0 && !filters.statuses.has(d.status)) {
        return false
      }
      if (search) {
        const hay = [
          d.name,
          d.serial_number,
          d.management_ip,
          d.manufacturer,
          d.model,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(search)) return false
      }
      return true
    })
  }, [devices, filters])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      const va = ((a[sortKey] as string | null) ?? '').toString().toLowerCase()
      const vb = ((b[sortKey] as string | null) ?? '').toString().toLowerCase()
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 opacity-40" />
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3" />
    ) : (
      <ArrowDown className="w-3 h-3" />
    )
  }

  const hasFilters =
    filters.search.length > 0 ||
    filters.types.size > 0 ||
    filters.statuses.size > 0

  const clearFilters = () =>
    setFilters({
      search: '',
      types: new Set<NetworkDeviceType>(),
      statuses: new Set<NetworkDeviceStatus>(),
    })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search name, serial, IP, or manufacturer..."
              value={filters.search}
              onChange={(e) =>
                setFilters((p) => ({ ...p, search: e.target.value }))
              }
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs uppercase tracking-wide text-gray-500 self-center mr-1">
              Type:
            </span>
            {(Object.keys(DEVICE_TYPE_LABEL) as NetworkDeviceType[]).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors ${
                    filters.types.has(t)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <DeviceTypeIcon type={t} className="w-3 h-3" />
                  {DEVICE_TYPE_LABEL[t]}
                </button>
              )
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs uppercase tracking-wide text-gray-500 self-center mr-1">
              Status:
            </span>
            {(Object.keys(STATUS_BADGE_CLASS) as NetworkDeviceStatus[]).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
                    filters.statuses.has(s)
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {s}
                </button>
              )
            )}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto px-3 py-1 text-xs rounded-full border border-red-300 text-red-600 hover:bg-red-50"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-12 text-center">
            <HardDrive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">
              {hasFilters
                ? 'No devices match your filters.'
                : 'No devices yet.'}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortableHeader
                    label="Name"
                    sortKey="name"
                    current={sortKey}
                    onClick={handleSort}
                    icon={sortIcon('name')}
                  />
                  <SortableHeader
                    label="Type"
                    sortKey="device_type"
                    current={sortKey}
                    onClick={handleSort}
                    icon={sortIcon('device_type')}
                  />
                  {showOfficeColumn && (
                    <th className="text-left px-4 py-3 font-medium text-gray-700">
                      Office
                    </th>
                  )}
                  <SortableHeader
                    label="Manufacturer / Model"
                    sortKey="manufacturer"
                    current={sortKey}
                    onClick={handleSort}
                    icon={sortIcon('manufacturer')}
                  />
                  <th className="text-left px-4 py-3 font-medium text-gray-700">
                    IP
                  </th>
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    current={sortKey}
                    onClick={handleSort}
                    icon={sortIcon('status')}
                  />
                  <SortableHeader
                    label="Last Seen"
                    sortKey="last_seen"
                    current={sortKey}
                    onClick={handleSort}
                    icon={sortIcon('last_seen')}
                  />
                  <th className="text-left px-4 py-3 font-medium text-gray-700">
                    Source
                  </th>
                  {canEdit && (
                    <th className="text-right px-4 py-3 font-medium text-gray-700">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/network/devices/${device.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {device.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="inline-flex items-center gap-1.5">
                        <DeviceTypeIcon type={device.device_type} />
                        {DEVICE_TYPE_LABEL[device.device_type]}
                      </span>
                    </td>
                    {showOfficeColumn && (
                      <td className="px-4 py-3 text-gray-700">
                        {device.office?.name ?? (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-700">
                      {device.manufacturer || device.model ? (
                        <div>
                          {device.manufacturer && (
                            <div>{device.manufacturer}</div>
                          )}
                          {device.model && (
                            <div className="text-xs text-gray-500">
                              {device.model}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                      {device.management_ip || (
                        <span className="text-gray-400 font-sans">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${
                          STATUS_BADGE_CLASS[device.status]
                        }`}
                      >
                        {device.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {device.last_seen
                        ? new Date(device.last_seen).toLocaleString()
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 capitalize">
                        {device.source}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(device)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit device"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(device)}
                              disabled={deletingId === device.id}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                              title="Delete device"
                            >
                              {deletingId === device.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <p className="text-xs text-gray-500 text-right">
          Showing {sorted.length} of {devices.length} device
          {devices.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

function SortableHeader({
  label,
  sortKey,
  current,
  onClick,
  icon,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  onClick: (key: SortKey) => void
  icon: React.ReactNode
}) {
  return (
    <th className="text-left px-4 py-3 font-medium text-gray-700">
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${
          current === sortKey ? 'text-gray-900' : ''
        }`}
      >
        {label}
        {icon}
      </button>
    </th>
  )
}

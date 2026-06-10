'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Network as NetworkIcon,
  Upload,
  Download,
  RefreshCw,
  Building2,
  Loader2,
  MapPin,
  HardDrive,
} from 'lucide-react'
import {
  DeviceTypeIcon,
  DEVICE_TYPE_LABEL,
  STATUS_BADGE_CLASS,
} from '@/components/network/NetworkDeviceTable'
import type {
  NetworkDevice,
  NetworkDeviceStatus,
  NetworkDeviceType,
  Office,
} from '@/lib/types'

interface OfficeWithDeviceCount extends Office {
  device_count?: number
}

export default function NetworkDashboardPage() {
  const [offices, setOffices] = useState<OfficeWithDeviceCount[]>([])
  const [devices, setDevices] = useState<NetworkDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [officesRes, devicesRes] = await Promise.all([
          fetch('/api/network/offices'),
          fetch('/api/network/devices'),
        ])
        const officesData = await officesRes.json()
        const devicesData = await devicesRes.json()
        if (!officesRes.ok) {
          throw new Error(officesData.error || 'Failed to load offices')
        }
        if (!devicesRes.ok) {
          throw new Error(devicesData.error || 'Failed to load devices')
        }
        setOffices(officesData.offices ?? [])
        setDevices(devicesData.devices ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const stats = useMemo(() => {
    const byType: Record<NetworkDeviceType, number> = {
      access_point: 0,
      switch: 0,
      firewall: 0,
      server: 0,
      router: 0,
      other: 0,
    }
    const byStatus: Record<NetworkDeviceStatus, number> = {
      online: 0,
      offline: 0,
      warning: 0,
      critical: 0,
      unknown: 0,
    }
    for (const d of devices) {
      byType[d.device_type] = (byType[d.device_type] ?? 0) + 1
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1
    }
    return { total: devices.length, byType, byStatus }
  }, [devices])

  const officeStats = useMemo(() => {
    const map = new Map<
      string,
      { count: number; worstStatus: NetworkDeviceStatus | null }
    >()
    const STATUS_RANK: Record<NetworkDeviceStatus, number> = {
      critical: 5,
      warning: 4,
      offline: 3,
      unknown: 2,
      online: 1,
    }
    for (const d of devices) {
      if (!d.office_id) continue
      const cur = map.get(d.office_id) ?? { count: 0, worstStatus: null }
      cur.count += 1
      if (
        cur.worstStatus === null ||
        STATUS_RANK[d.status] > STATUS_RANK[cur.worstStatus]
      ) {
        cur.worstStatus = d.status
      }
      map.set(d.office_id, cur)
    }
    return map
  }, [devices])

  const orphanedCount = devices.filter((d) => !d.office_id).length

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
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <NetworkIcon className="w-8 h-8 text-purple-600" />
                Network
              </h1>
              <p className="text-gray-600">
                Network device inventory across {offices.length} office
                {offices.length === 1 ? '' : 's'}.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/network/import"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Upload className="w-4 h-4" />
                Import devices
              </Link>
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                title="Available in Phase 18"
              >
                <Download className="w-4 h-4" />
                Export all
              </button>
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                title="Available in Phase 17"
              >
                <RefreshCw className="w-4 h-4" />
                Sync Auvik
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <p className="font-medium">Failed to load network data</p>
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : (
          <>
            {/* Aggregate stats */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Devices by Type
                  </h2>
                  <div className="text-3xl font-bold text-gray-900">
                    {stats.total}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(stats.byType) as NetworkDeviceType[]).map(
                    (t) => (
                      <div
                        key={t}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <DeviceTypeIcon
                            type={t}
                            className="w-4 h-4 text-gray-500"
                          />
                          {DEVICE_TYPE_LABEL[t]}
                        </div>
                        <div className="font-semibold text-gray-900">
                          {stats.byType[t]}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Devices by Status
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {(
                    Object.keys(stats.byStatus) as NetworkDeviceStatus[]
                  ).map((s) => (
                    <div
                      key={s}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_BADGE_CLASS[s]}`}
                      >
                        {s}
                      </span>
                      <div className="font-semibold text-gray-900">
                        {stats.byStatus[s]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Map placeholder */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8 border-2 border-dashed border-gray-200">
              <div className="flex items-center gap-3 text-gray-500">
                <MapPin className="w-5 h-5" />
                <div>
                  <h3 className="font-semibold">Geographic Map</h3>
                  <p className="text-sm">
                    The Leaflet map of all offices will live here (Phase 15).
                  </p>
                </div>
              </div>
            </div>

            {/* Office cards */}
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Offices
              </h2>
              <p className="text-gray-600 text-sm">
                Click any office to manage its network devices.
              </p>
            </div>
            {offices.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 mb-3">No offices yet.</p>
                <Link
                  href="/settings/offices"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Add your first office
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {offices.map((office) => {
                  const counts = officeStats.get(office.id) ?? {
                    count: 0,
                    worstStatus: null,
                  }
                  return (
                    <Link
                      key={office.id}
                      href={`/network/offices/${office.id}`}
                      className="group bg-white rounded-xl shadow-md p-6 hover:shadow-lg hover:border-blue-300 border border-transparent transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-blue-600" />
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-700">
                            {office.name}
                          </h3>
                        </div>
                        {counts.worstStatus && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_BADGE_CLASS[counts.worstStatus]}`}
                            title={`Worst-status device in this office: ${counts.worstStatus}`}
                          >
                            {counts.worstStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-1">
                        {[office.city, office.state].filter(Boolean).join(', ') ||
                          'No address on file'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <HardDrive className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{counts.count}</span>
                        <span className="text-gray-500">
                          device{counts.count === 1 ? '' : 's'}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}

            {orphanedCount > 0 && (
              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium">
                  {orphanedCount} device{orphanedCount === 1 ? '' : 's'} not
                  assigned to any office
                </p>
                <p className="mt-1">
                  These devices show up in the totals above but aren't linked
                  to a location. Edit each device's office field to fix.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

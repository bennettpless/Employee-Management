'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
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
  AlertCircle,
} from 'lucide-react'
import {
  DeviceTypeIcon,
  DEVICE_TYPE_LABEL,
  STATUS_BADGE_CLASS,
} from '@/components/network/NetworkDeviceTable'
import { aggregateOfficeStats } from '@/lib/network-stats'
import type {
  NetworkDevice,
  NetworkDeviceStatus,
  NetworkDeviceType,
  Office,
} from '@/lib/types'

// Leaflet touches `window` at import time — load the map on the client only so
// the production build and any future server-rendered shells don't blow up.
const OfficeMap = dynamic(() => import('@/components/network/OfficeMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] bg-gray-100 animate-pulse rounded-xl shadow-md" />
  ),
})

export default function NetworkDashboardPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [offices, setOffices] = useState<Office[]>([])
  const [devices, setDevices] = useState<NetworkDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auvikConfigured, setAuvikConfigured] = useState<boolean | null>(null)
  const [auvikSyncing, setAuvikSyncing] = useState(false)
  const [auvikMessage, setAuvikMessage] = useState<string | null>(null)

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

  useEffect(() => {
    let cancelled = false
    const checkAuvik = async () => {
      try {
        const res = await fetch('/api/network/sync/auvik', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setAuvikConfigured(false)
          return
        }
        const data = await res.json()
        if (!cancelled) setAuvikConfigured(Boolean(data.configured))
      } catch {
        if (!cancelled) setAuvikConfigured(false)
      }
    }
    checkAuvik()
    return () => {
      cancelled = true
    }
  }, [])

  const handleAuvikSync = async () => {
    if (auvikSyncing) return
    setAuvikSyncing(true)
    setAuvikMessage(null)
    try {
      const res = await fetch('/api/network/sync/auvik', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Auvik sync failed')
      }
      setAuvikMessage(
        `Sync complete: ${data.devicesUpserted ?? 0} devices, ${data.connectionsUpserted ?? 0} connections in ${data.duration ?? 0}s.`
      )
      const [officesRes, devicesRes] = await Promise.all([
        fetch('/api/network/offices'),
        fetch('/api/network/devices'),
      ])
      const officesData = await officesRes.json()
      const devicesData = await devicesRes.json()
      if (officesRes.ok) setOffices(officesData.offices ?? [])
      if (devicesRes.ok) setDevices(devicesData.devices ?? [])
    } catch (err) {
      setAuvikMessage(err instanceof Error ? err.message : 'Auvik sync failed')
    } finally {
      setAuvikSyncing(false)
    }
  }

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

  const officesWithStats = useMemo(
    () => aggregateOfficeStats(offices, devices),
    [offices, devices]
  )

  const unmappedOffices = useMemo(
    () =>
      officesWithStats.filter(
        (o) => o.latitude === null || o.longitude === null
      ),
    [officesWithStats]
  )

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
              {isAdmin && auvikConfigured && (
                <button
                  onClick={handleAuvikSync}
                  disabled={auvikSyncing}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors text-sm"
                >
                  {auvikSyncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {auvikSyncing ? 'Syncing Auvik...' : 'Sync Auvik'}
                </button>
              )}
              {isAdmin && auvikConfigured === false && (
                <button
                  disabled
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-500 rounded-lg text-sm cursor-not-allowed"
                  title="Set AUVIK_API_USER, AUVIK_API_KEY, and AUVIK_TENANT_DOMAIN to enable Auvik sync"
                >
                  <RefreshCw className="w-4 h-4" />
                  Sync Auvik
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <p className="font-medium">Failed to load network data</p>
            <p>{error}</p>
          </div>
        )}

        {auvikMessage && (
          <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
            {auvikMessage}
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

            {/* Geographic map */}
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-purple-600" />
                Geographic Map
              </h2>
              <p className="text-gray-600 text-sm">
                Pins are coloured by the worst-status device in each office.
                Click a pin for details.
              </p>
            </div>
            <div className="mb-8">
              <OfficeMap offices={officesWithStats} />
            </div>

            {/* Unmapped offices */}
            {unmappedOffices.length > 0 && (
              <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-900 mb-1">
                      {unmappedOffices.length} office
                      {unmappedOffices.length === 1 ? '' : 's'} missing
                      coordinates
                    </p>
                    <p className="text-sm text-amber-800 mb-2">
                      These offices won't appear on the map until latitude and
                      longitude are set:
                    </p>
                    <ul className="text-sm text-amber-900 mb-3 list-disc list-inside space-y-0.5">
                      {unmappedOffices.map((o) => (
                        <li key={o.id}>{o.name}</li>
                      ))}
                    </ul>
                    <Link
                      href="/settings/offices"
                      className="inline-flex items-center text-sm font-medium text-amber-900 hover:text-amber-700 underline"
                    >
                      Fix in office settings &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            )}

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
                {officesWithStats.map((office) => (
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
                      {office.deviceCount > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_BADGE_CLASS[office.worstStatus]}`}
                          title={`Worst-status device in this office: ${office.worstStatus}`}
                        >
                          {office.worstStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-1">
                      {[office.city, office.state].filter(Boolean).join(', ') ||
                        'No address on file'}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <HardDrive className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{office.deviceCount}</span>
                      <span className="text-gray-500">
                        device{office.deviceCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </Link>
                ))}
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

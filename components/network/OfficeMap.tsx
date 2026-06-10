'use client'

import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import Link from 'next/link'
import { Building2, HardDrive } from 'lucide-react'
import type { NetworkDeviceStatus } from '@/lib/types'
import type { OfficeWithStats } from '@/lib/network-stats'

// Continental US — used when no office has coords so the map still renders.
const DEFAULT_CENTER: [number, number] = [39.5, -98.35]
const DEFAULT_ZOOM = 4
const SINGLE_OFFICE_ZOOM = 12

const STATUS_COLORS: Record<NetworkDeviceStatus, string> = {
  online: '#16a34a',
  warning: '#f59e0b',
  critical: '#dc2626',
  offline: '#6b7280',
  unknown: '#9ca3af',
}

const STATUS_LABEL: Record<NetworkDeviceStatus, string> = {
  online: 'Online',
  warning: 'Warning',
  critical: 'Critical',
  offline: 'Offline',
  unknown: 'Unknown',
}

interface OfficeMapProps {
  offices: OfficeWithStats[]
}

interface MappableOffice extends OfficeWithStats {
  latitude: number
  longitude: number
}

function isMappable(office: OfficeWithStats): office is MappableOffice {
  return (
    typeof office.latitude === 'number' &&
    typeof office.longitude === 'number' &&
    Number.isFinite(office.latitude) &&
    Number.isFinite(office.longitude)
  )
}

function buildIcon(status: NetworkDeviceStatus): L.DivIcon {
  const color = STATUS_COLORS[status]
  // Default Leaflet marker images don't resolve through the Next bundler, so
  // use a small CSS dot via divIcon instead.
  return L.divIcon({
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px ${color}"></div>`,
    className: 'office-map-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

/**
 * Calls `map.fitBounds()` whenever the set of mappable offices changes.
 * Must live inside `<MapContainer>` so `useMap()` resolves to the right map.
 */
function FitBounds({ offices }: { offices: MappableOffice[] }) {
  const map = useMap()
  useEffect(() => {
    if (offices.length < 2) return
    const bounds = L.latLngBounds(
      offices.map((o) => [o.latitude, o.longitude] as [number, number])
    )
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
  }, [map, offices])
  return null
}

export default function OfficeMap({ offices }: OfficeMapProps) {
  const mappable = useMemo(() => offices.filter(isMappable), [offices])

  // Pick an initial center/zoom. `FitBounds` will tighten it for the 2+ case.
  const { center, zoom } = useMemo(() => {
    if (mappable.length === 0) {
      return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }
    }
    if (mappable.length === 1) {
      return {
        center: [mappable[0].latitude, mappable[0].longitude] as [
          number,
          number,
        ],
        zoom: SINGLE_OFFICE_ZOOM,
      }
    }
    const lat =
      mappable.reduce((sum, o) => sum + o.latitude, 0) / mappable.length
    const lng =
      mappable.reduce((sum, o) => sum + o.longitude, 0) / mappable.length
    return { center: [lat, lng] as [number, number], zoom: DEFAULT_ZOOM }
  }, [mappable])

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      style={{ height: '500px', width: '100%' }}
      className="rounded-xl shadow-md z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
      />
      <FitBounds offices={mappable} />
      {mappable.map((office) => (
        <Marker
          key={office.id}
          position={[office.latitude, office.longitude]}
          icon={buildIcon(office.worstStatus)}
        >
          <Popup>
            <div className="min-w-[200px]">
              <div className="flex items-center gap-2 font-semibold text-gray-900 mb-1">
                <Building2 className="w-4 h-4 text-blue-600" />
                {office.name}
              </div>
              {(office.city || office.state) && (
                <div className="text-xs text-gray-500 mb-2">
                  {[office.city, office.state].filter(Boolean).join(', ')}
                </div>
              )}
              <div className="flex items-center gap-1 text-sm text-gray-700 mb-2">
                <HardDrive className="w-3.5 h-3.5 text-gray-500" />
                <span className="font-medium">{office.deviceCount}</span>
                <span className="text-gray-500">
                  device{office.deviceCount === 1 ? '' : 's'}
                </span>
              </div>
              <ul className="space-y-0.5 text-xs text-gray-700 mb-3">
                {(
                  Object.keys(office.statusCounts) as NetworkDeviceStatus[]
                )
                  .filter((s) => office.statusCounts[s] > 0)
                  .map((s) => (
                    <li
                      key={s}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          style={{ background: STATUS_COLORS[s] }}
                          className="inline-block w-2 h-2 rounded-full"
                        />
                        {STATUS_LABEL[s]}
                      </span>
                      <span className="font-medium">
                        {office.statusCounts[s]}
                      </span>
                    </li>
                  ))}
              </ul>
              <Link
                href={`/network/offices/${office.id}`}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Open office &rarr;
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

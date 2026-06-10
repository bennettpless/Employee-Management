import type {
  NetworkDevice,
  NetworkDeviceStatus,
  Office,
} from '@/lib/types'

// Priority used to pick the single "worst" status to colour an office marker.
// Higher number = worse. critical > offline > warning > unknown > online.
export const STATUS_RANK: Record<NetworkDeviceStatus, number> = {
  critical: 5,
  offline: 4,
  warning: 3,
  unknown: 2,
  online: 1,
}

export type StatusCounts = Record<NetworkDeviceStatus, number>

export interface OfficeWithStats extends Office {
  deviceCount: number
  statusCounts: StatusCounts
  worstStatus: NetworkDeviceStatus
}

function emptyStatusCounts(): StatusCounts {
  return {
    online: 0,
    offline: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
  }
}

/**
 * Build per-office aggregate stats for the network dashboard + map:
 *   - deviceCount   total devices assigned to the office
 *   - statusCounts  per-status counts
 *   - worstStatus   highest-severity status present (online if no devices)
 *
 * Devices with `office_id === null` are skipped (they're surfaced separately
 * via the "unassigned devices" UI in `app/network/page.tsx`).
 */
export function aggregateOfficeStats(
  offices: Office[],
  devices: NetworkDevice[]
): OfficeWithStats[] {
  const byOffice = new Map<string, { count: number; status: StatusCounts }>()
  for (const office of offices) {
    byOffice.set(office.id, { count: 0, status: emptyStatusCounts() })
  }

  for (const device of devices) {
    if (!device.office_id) continue
    const bucket = byOffice.get(device.office_id)
    if (!bucket) continue
    bucket.count += 1
    bucket.status[device.status] += 1
  }

  return offices.map((office) => {
    const bucket = byOffice.get(office.id) ?? {
      count: 0,
      status: emptyStatusCounts(),
    }
    return {
      ...office,
      deviceCount: bucket.count,
      statusCounts: bucket.status,
      worstStatus: pickWorstStatus(bucket.status),
    }
  })
}

function pickWorstStatus(counts: StatusCounts): NetworkDeviceStatus {
  let worst: NetworkDeviceStatus = 'online'
  let worstRank = -1
  for (const status of Object.keys(counts) as NetworkDeviceStatus[]) {
    if (counts[status] > 0 && STATUS_RANK[status] > worstRank) {
      worst = status
      worstRank = STATUS_RANK[status]
    }
  }
  return worst
}

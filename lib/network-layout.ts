import type {
  NetworkDevice,
  NetworkDeviceConnection,
  NetworkDeviceType,
} from '@/lib/types'

/**
 * Per-row Y coordinate for the auto-layout algorithm. The diagram reads
 * top-down: edge devices at the top, switching in the middle, endpoints at
 * the bottom. This is intentionally naive — it produces a sensible default
 * for the single-firewall, few-switches topology that's typical per office
 * and gives the operator a reasonable starting point to drag from.
 */
const ROW_Y: Record<NetworkDeviceType, number> = {
  firewall: 50,
  router: 150,
  switch: 300,
  access_point: 500,
  server: 500,
  other: 500,
}

const X_START = 100
const X_STEP = 220
const UNCONNECTED_X_OFFSET = 200 // gap between the connected cluster and the unconnected cluster

export interface NodePosition {
  device_id: string
  x: number
  y: number
}

/**
 * Returns true when the device has at least one edge in either direction.
 * "Unconnected" devices get pushed into a separate cluster on the right so
 * they don't fight the connected layout for horizontal space.
 */
function buildConnectedSet(
  connections: Pick<
    NetworkDeviceConnection,
    'source_device_id' | 'target_device_id'
  >[]
): Set<string> {
  const set = new Set<string>()
  for (const c of connections) {
    set.add(c.source_device_id)
    set.add(c.target_device_id)
  }
  return set
}

/**
 * Compute auto-layout positions for every device in `devices`, grouped by
 * device_type and split into connected vs. unconnected clusters.
 *
 * The output is sorted by device id within each row so the layout is stable
 * across re-renders (React Flow only repositions a node when its `position`
 * actually changes).
 *
 * Returns positions for every device, including those that already have
 * `layout_x`/`layout_y` set — the caller decides which ones to persist.
 */
export function computeAutoLayout(
  devices: NetworkDevice[],
  connections: Pick<
    NetworkDeviceConnection,
    'source_device_id' | 'target_device_id'
  >[]
): NodePosition[] {
  const connected = buildConnectedSet(connections)

  // Sort by id so the placement is deterministic — otherwise Supabase row
  // ordering would shuffle the diagram on each fetch.
  const sorted = [...devices].sort((a, b) => a.id.localeCompare(b.id))

  // Group connected devices into rows keyed by their canonical row Y.
  const connectedRows = new Map<number, NetworkDevice[]>()
  const unconnectedRows = new Map<number, NetworkDevice[]>()

  for (const device of sorted) {
    const y = ROW_Y[device.device_type]
    const bucket = connected.has(device.id) ? connectedRows : unconnectedRows
    const row = bucket.get(y) ?? []
    row.push(device)
    bucket.set(y, row)
  }

  const positions: NodePosition[] = []

  for (const [y, row] of connectedRows.entries()) {
    row.forEach((device, index) => {
      positions.push({
        device_id: device.id,
        x: X_START + index * X_STEP,
        y,
      })
    })
  }

  // Width of the widest connected row, used to offset the unconnected cluster
  // so the two never overlap.
  const widestConnectedRow = Array.from(connectedRows.values()).reduce(
    (max, row) => Math.max(max, row.length),
    0
  )
  const unconnectedStartX =
    widestConnectedRow > 0
      ? X_START + widestConnectedRow * X_STEP + UNCONNECTED_X_OFFSET
      : X_START

  for (const [y, row] of unconnectedRows.entries()) {
    row.forEach((device, index) => {
      positions.push({
        device_id: device.id,
        x: unconnectedStartX + index * X_STEP,
        y,
      })
    })
  }

  return positions
}

/**
 * Merge saved (`layout_x`, `layout_y`) values with auto-layout fallback
 * positions. Devices with both coordinates set keep their saved position;
 * devices missing either coordinate get the auto-layout coordinate so the
 * diagram always has somewhere to put every node.
 */
export function resolveDevicePositions(
  devices: NetworkDevice[],
  connections: Pick<
    NetworkDeviceConnection,
    'source_device_id' | 'target_device_id'
  >[]
): Map<string, { x: number; y: number }> {
  const auto = computeAutoLayout(devices, connections)
  const autoById = new Map(auto.map((p) => [p.device_id, { x: p.x, y: p.y }]))

  const out = new Map<string, { x: number; y: number }>()
  for (const device of devices) {
    const saved =
      device.layout_x != null && device.layout_y != null
        ? { x: Number(device.layout_x), y: Number(device.layout_y) }
        : null
    const fallback = autoById.get(device.id) ?? { x: X_START, y: 50 }
    out.set(device.id, saved ?? fallback)
  }
  return out
}

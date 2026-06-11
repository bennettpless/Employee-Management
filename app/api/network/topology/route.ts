import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { resolveDevicePositions } from '@/lib/network-layout'
import type { NetworkDevice, NetworkDeviceConnection } from '@/lib/types'

/**
 * GET /api/network/topology?officeId=<uuid>
 *
 * Returns the React Flow `{ nodes, edges }` payload for a single office:
 *   - one node per `network_devices` row in the office
 *   - one edge per `network_device_connections` row where BOTH endpoints
 *     belong to that office (cross-office links are filtered out so they
 *     never render as dangling edges)
 *
 * Node positions come from `network_devices.layout_x`/`layout_y` when set,
 * and fall back to the auto-layout algorithm in `lib/network-layout.ts`.
 *
 * Authenticated read for any user. The middleware already gates this.
 */
export async function GET(request: NextRequest) {
  try {
    const officeId = new URL(request.url).searchParams.get('officeId')
    if (!officeId) {
      return NextResponse.json(
        { error: 'officeId query parameter is required' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    const { data: devices, error: devicesError } = await supabase
      .from('network_devices')
      .select('*')
      .eq('office_id', officeId)
      .order('name', { ascending: true })

    if (devicesError) throw devicesError

    const deviceRows = (devices ?? []) as NetworkDevice[]
    const deviceIds = deviceRows.map((d) => d.id)

    // No devices ⇒ no edges to fetch. Short-circuit to avoid an empty `.in()`
    // call (PostgREST treats an empty `in` list as "match nothing", which is
    // technically correct, but skipping it is cheaper and keeps the response
    // shape consistent).
    if (deviceIds.length === 0) {
      return NextResponse.json({ nodes: [], edges: [] })
    }

    const { data: connections, error: connectionsError } = await supabase
      .from('network_device_connections')
      .select('*')
      .in('source_device_id', deviceIds)
      .in('target_device_id', deviceIds)

    if (connectionsError) throw connectionsError

    const connectionRows =
      (connections ?? []) as NetworkDeviceConnection[]

    const positions = resolveDevicePositions(deviceRows, connectionRows)

    const nodes = deviceRows.map((device) => {
      const pos = positions.get(device.id) ?? { x: 100, y: 50 }
      return {
        id: device.id,
        type: 'networkDevice' as const,
        position: pos,
        // React Flow stringifies node data into the DOM data-* attributes
        // during export, so we keep this lean — full device record is fine
        // since each row is ~20 columns.
        data: { device },
      }
    })

    const edges = connectionRows.map((c) => ({
      id: c.id,
      source: c.source_device_id,
      target: c.target_device_id,
      sourceHandle: undefined as string | undefined,
      targetHandle: undefined as string | undefined,
      label:
        c.source_port || c.target_port
          ? [c.source_port, c.target_port].filter(Boolean).join(' → ')
          : undefined,
      data: { connection: c },
    }))

    return NextResponse.json({ nodes, edges })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch topology'
    console.error('Error fetching network topology:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

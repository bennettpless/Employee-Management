import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'

/**
 * POST /api/network/topology/positions
 *
 * Persist React Flow node positions. Accepts a single position update or a
 * batch — the topology component uses single updates on `onNodeDragStop`
 * and a batch payload on the "Auto-layout" button.
 *
 * Body (single or array):
 *   { device_id: string, layout_x: number, layout_y: number }
 *
 * Admin-only, like every other write on `/api/network/devices*`.
 */

interface PositionUpdate {
  device_id: string
  layout_x: number
  layout_y: number
}

function parseUpdate(raw: unknown): PositionUpdate | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = obj.device_id
  const x = obj.layout_x
  const y = obj.layout_y
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  if (typeof y !== 'number' || !Number.isFinite(y)) return null
  return { device_id: id, layout_x: x, layout_y: y }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as unknown
    const list: unknown[] = Array.isArray(body) ? body : [body]
    const updates = list
      .map(parseUpdate)
      .filter((u): u is PositionUpdate => u !== null)

    if (updates.length === 0) {
      return NextResponse.json(
        {
          error:
            'Expected { device_id, layout_x, layout_y } or an array of those',
        },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    // Supabase's `upsert` would be tempting here, but `network_devices` has a
    // CHECK constraint on `device_type` that an upsert payload would have to
    // satisfy — and we don't want to overwrite anything except the layout
    // fields. A per-row UPDATE keeps the payload minimal and surface
    // constraints contained.
    const results = await Promise.all(
      updates.map((u) =>
        supabase
          .from('network_devices')
          .update({ layout_x: u.layout_x, layout_y: u.layout_y })
          .eq('id', u.device_id)
      )
    )

    const failed = results.find((r) => r.error)
    if (failed?.error) throw failed.error

    return NextResponse.json({ updated: updates.length })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to update topology positions'
    console.error('Error updating topology positions:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

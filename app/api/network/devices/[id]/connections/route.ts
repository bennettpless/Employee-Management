import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'
import type { NetworkLinkType } from '@/lib/types'

const VALID_LINK_TYPES: readonly NetworkLinkType[] = [
  'ethernet',
  'fiber',
  'wireless',
  'other',
]

/**
 * POST /api/network/devices/[id]/connections
 *
 * Create a new topology edge originating from device `[id]`.
 *
 * Body:
 *   {
 *     target_device_id: string (required),
 *     source_port?: string | null,
 *     target_port?: string | null,
 *     link_type?: 'ethernet' | 'fiber' | 'wireless' | 'other' | null
 *   }
 *
 * Self-loops (source === target) and duplicates (UNIQUE constraint on
 * source/target/source_port/target_port) are rejected.
 *
 * Admin-only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const sourceId = params.id
    const body = (await request.json()) as Record<string, unknown>

    const targetId = body.target_device_id
    if (typeof targetId !== 'string' || targetId.length === 0) {
      return NextResponse.json(
        { error: 'target_device_id is required' },
        { status: 400 }
      )
    }
    if (targetId === sourceId) {
      return NextResponse.json(
        { error: 'A device cannot connect to itself' },
        { status: 400 }
      )
    }

    const sourcePort =
      typeof body.source_port === 'string' && body.source_port.trim().length > 0
        ? body.source_port.trim()
        : null
    const targetPort =
      typeof body.target_port === 'string' && body.target_port.trim().length > 0
        ? body.target_port.trim()
        : null

    let linkType: NetworkLinkType | null = null
    if (body.link_type != null) {
      if (
        typeof body.link_type !== 'string' ||
        !VALID_LINK_TYPES.includes(body.link_type as NetworkLinkType)
      ) {
        return NextResponse.json(
          {
            error: `link_type must be one of: ${VALID_LINK_TYPES.join(', ')}`,
          },
          { status: 400 }
        )
      }
      linkType = body.link_type as NetworkLinkType
    }

    const supabase = getServiceSupabase()

    // Verify both endpoints exist before insert so the FK error doesn't
    // surface as a generic 500.
    const { data: endpoints, error: endpointsError } = await supabase
      .from('network_devices')
      .select('id')
      .in('id', [sourceId, targetId])

    if (endpointsError) throw endpointsError
    if (!endpoints || endpoints.length < 2) {
      return NextResponse.json(
        { error: 'One or both devices not found' },
        { status: 404 }
      )
    }

    const { data, error } = await supabase
      .from('network_device_connections')
      .insert({
        source_device_id: sourceId,
        target_device_id: targetId,
        source_port: sourcePort,
        target_port: targetPort,
        link_type: linkType,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A connection between these devices/ports already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ connection: data }, { status: 201 })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to create network connection'
    console.error('Error creating network connection:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/network/devices/[id]/connections?connectionId=<uuid>
 * DELETE /api/network/devices/[id]/connections?targetDeviceId=<uuid>&sourcePort=<port>
 *
 * Remove a single topology edge. Prefer `connectionId` when the caller has
 * the UUID (the React Flow edge id is the connection's UUID). The
 * `targetDeviceId`+`sourcePort` form is the plan-spec fallback for callers
 * that only know the edge by its endpoints.
 *
 * Both forms require that the connection's `source_device_id` matches the
 * `[id]` route param so the URL fully identifies the row.
 *
 * Admin-only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const sourceId = params.id
    const url = new URL(request.url)
    const connectionId = url.searchParams.get('connectionId')
    const targetDeviceId = url.searchParams.get('targetDeviceId')
    const sourcePortParam = url.searchParams.get('sourcePort')

    const supabase = getServiceSupabase()

    if (connectionId) {
      const { error, count } = await supabase
        .from('network_device_connections')
        .delete({ count: 'exact' })
        .eq('id', connectionId)
        .eq('source_device_id', sourceId)

      if (error) throw error
      if (!count) {
        return NextResponse.json(
          { error: 'Connection not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ success: true })
    }

    if (targetDeviceId) {
      let query = supabase
        .from('network_device_connections')
        .delete({ count: 'exact' })
        .eq('source_device_id', sourceId)
        .eq('target_device_id', targetDeviceId)

      // `sourcePort=` (empty string) is treated as "match the NULL port",
      // matching the UNIQUE constraint's semantics. Anything else is matched
      // literally.
      if (sourcePortParam == null || sourcePortParam.length === 0) {
        query = query.is('source_port', null)
      } else {
        query = query.eq('source_port', sourcePortParam)
      }

      const { error, count } = await query
      if (error) throw error
      if (!count) {
        return NextResponse.json(
          { error: 'Connection not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      {
        error:
          'Provide either ?connectionId=<uuid> or ?targetDeviceId=<uuid>[&sourcePort=<port>]',
      },
      { status: 400 }
    )
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to delete network connection'
    console.error('Error deleting network connection:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

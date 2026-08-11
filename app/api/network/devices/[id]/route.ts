import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'
import {
  VALID_DEVICE_TYPES,
  VALID_STATUSES,
} from '@/lib/network-import'
import type {
  NetworkDeviceSource,
  NetworkDeviceStatus,
  NetworkDeviceType,
} from '@/lib/types'

const DEVICE_FIELDS = [
  'office_id',
  'name',
  'device_type',
  'manufacturer',
  'model',
  'serial_number',
  'firmware_version',
  'management_ip',
  'management_url',
  'mac_address',
  'status',
  'credentials_vault_ref',
  'notes',
  'source',
] as const

type DeviceField = (typeof DEVICE_FIELDS)[number]

const VALID_SOURCES: readonly NetworkDeviceSource[] = ['manual', 'csv']

function sanitizeDeviceBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}

  for (const field of DEVICE_FIELDS) {
    if (!(field in body)) continue
    const raw = body[field as DeviceField]

    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      out[field] = trimmed.length === 0 ? null : trimmed
    } else if (raw === null || raw === undefined) {
      out[field] = null
    } else {
      out[field] = raw
    }
  }

  return out
}

function validateDevicePayload(data: Record<string, unknown>): string | null {
  if ('name' in data && (!data.name || typeof data.name !== 'string')) {
    return 'name cannot be empty'
  }
  if (
    'device_type' in data &&
    data.device_type != null &&
    !VALID_DEVICE_TYPES.includes(data.device_type as NetworkDeviceType)
  ) {
    return `device_type must be one of: ${VALID_DEVICE_TYPES.join(', ')}`
  }
  if (
    'status' in data &&
    data.status != null &&
    !VALID_STATUSES.includes(data.status as NetworkDeviceStatus)
  ) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`
  }
  if (
    'source' in data &&
    data.source != null &&
    !VALID_SOURCES.includes(data.source as NetworkDeviceSource)
  ) {
    return `source must be one of: ${VALID_SOURCES.join(', ')}`
  }
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()

    const { data: device, error } = await supabase
      .from('network_devices')
      .select('*, office:offices(id, name, city, state)')
      .eq('id', params.id)
      .single()

    if (error || !device) {
      return NextResponse.json(
        { error: 'Network device not found' },
        { status: 404 }
      )
    }

    const { data: outgoing } = await supabase
      .from('network_device_connections')
      .select(
        'id, source_device_id, target_device_id, source_port, target_port, link_type, target:network_devices!network_device_connections_target_device_id_fkey(id, name, device_type)'
      )
      .eq('source_device_id', device.id)

    const { data: incoming } = await supabase
      .from('network_device_connections')
      .select(
        'id, source_device_id, target_device_id, source_port, target_port, link_type, source:network_devices!network_device_connections_source_device_id_fkey(id, name, device_type)'
      )
      .eq('target_device_id', device.id)

    return NextResponse.json({
      device: {
        ...device,
        outgoing_connections: outgoing ?? [],
        incoming_connections: incoming ?? [],
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch network device'
    console.error('Error fetching network device:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
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

    const body = (await request.json()) as Record<string, unknown>
    const updateData = sanitizeDeviceBody(body)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided' },
        { status: 400 }
      )
    }

    const validationError = validateDevicePayload(updateData)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('network_devices')
      .update(updateData)
      .eq('id', params.id)
      .select('*, office:offices(id, name, city, state)')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A network device with those unique identifiers already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Network device not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ device: data })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to update network device'
    console.error('Error updating network device:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('network_devices')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete network device'
    console.error('Error deleting network device:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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
  'is_manually_overridden',
] as const

type DeviceField = (typeof DEVICE_FIELDS)[number]

const VALID_SOURCES: readonly NetworkDeviceSource[] = ['manual', 'auvik', 'csv']

function sanitizeDeviceBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}

  for (const field of DEVICE_FIELDS) {
    if (!(field in body)) continue
    const raw = body[field as DeviceField]

    if (field === 'is_manually_overridden') {
      out[field] = Boolean(raw)
      continue
    }

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

/**
 * Returns a human-readable validation error for the create/update payload,
 * or null if the payload is acceptable. Only checks fields that are present
 * (so PATCH callers can submit partial updates).
 */
function validateDevicePayload(
  data: Record<string, unknown>,
  { requireRequired }: { requireRequired: boolean }
): string | null {
  if (requireRequired) {
    if (!data.name || typeof data.name !== 'string') {
      return 'name is required'
    }
    if (!data.device_type || typeof data.device_type !== 'string') {
      return 'device_type is required'
    }
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

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const params = new URL(request.url).searchParams

    const officeId = params.get('office_id')
    const deviceType = params.get('device_type')
    const status = params.get('status')
    const search = params.get('search')

    let query = supabase
      .from('network_devices')
      .select('*, office:offices(id, name, city, state)')
      .order('name', { ascending: true })

    if (officeId) query = query.eq('office_id', officeId)
    if (deviceType) query = query.eq('device_type', deviceType)
    if (status) query = query.eq('status', status)

    if (search && search.trim().length > 0) {
      const safe = search.trim().replace(/[%,]/g, '')
      if (safe.length > 0) {
        const pattern = `%${safe}%`
        query = query.or(
          `name.ilike.${pattern},serial_number.ilike.${pattern},management_ip.ilike.${pattern},manufacturer.ilike.${pattern}`
        )
      }
    }

    const { data: devices, error } = await query
    if (error) throw error

    return NextResponse.json({ devices: devices ?? [] })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch network devices'
    console.error('Error fetching network devices:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as Record<string, unknown>
    const insertData = sanitizeDeviceBody(body)

    if (!insertData.source) insertData.source = 'manual'

    const validationError = validateDevicePayload(insertData, {
      requireRequired: true,
    })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('network_devices')
      .insert(insertData)
      .select('*, office:offices(id, name, city, state)')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A network device with that Auvik ID already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ device: data }, { status: 201 })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to create network device'
    console.error('Error creating network device:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

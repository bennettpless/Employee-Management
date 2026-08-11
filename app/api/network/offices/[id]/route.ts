import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'

const OFFICE_FIELDS = [
  'name',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'latitude',
  'longitude',
  'notes',
  'status',
] as const

type OfficeField = typeof OFFICE_FIELDS[number]

function sanitizeOfficeBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const field of OFFICE_FIELDS) {
    if (!(field in body)) continue
    const raw = body[field as OfficeField]

    if (field === 'latitude' || field === 'longitude') {
      if (raw === '' || raw === null || raw === undefined) {
        out[field] = null
      } else {
        const n = Number(raw)
        out[field] = Number.isFinite(n) ? n : null
      }
      continue
    }

    if (field === 'status') {
      out[field] = raw === 'offline' ? 'offline' : 'online'
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()

    const { data: office, error } = await supabase
      .from('offices')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !office) {
      return NextResponse.json({ error: 'Office not found' }, { status: 404 })
    }

    const { count: deviceCount } = await supabase
      .from('network_devices')
      .select('*', { count: 'exact', head: true })
      .eq('office_id', office.id)

    return NextResponse.json({
      office: { ...office, device_count: deviceCount || 0 },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch office'
    console.error('Error fetching office:', error)
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
    const updateData = sanitizeOfficeBody(body)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided' },
        { status: 400 }
      )
    }

    if ('name' in updateData && (!updateData.name || typeof updateData.name !== 'string')) {
      return NextResponse.json(
        { error: 'Office name cannot be empty' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('offices')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An office with that name already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    if (!data) {
      return NextResponse.json({ error: 'Office not found' }, { status: 404 })
    }

    return NextResponse.json({ office: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update office'
    console.error('Error updating office:', error)
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
      .from('offices')
      .delete()
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete office'
    console.error('Error deleting office:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

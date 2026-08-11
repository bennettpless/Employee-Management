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

export async function GET() {
  try {
    const supabase = getServiceSupabase()

    const { data: offices, error } = await supabase
      .from('offices')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error

    let deviceCounts = new Map<string, number>()
    if (offices && offices.length > 0) {
      const officeIds = offices.map((o: { id: string }) => o.id)
      const { data: deviceRows } = await supabase
        .from('network_devices')
        .select('office_id')
        .in('office_id', officeIds)

      if (deviceRows) {
        for (const row of deviceRows as Array<{ office_id: string | null }>) {
          if (!row.office_id) continue
          deviceCounts.set(row.office_id, (deviceCounts.get(row.office_id) || 0) + 1)
        }
      }
    }

    const enriched = (offices || []).map((o: { id: string }) => ({
      ...o,
      device_count: deviceCounts.get(o.id) || 0,
    }))

    return NextResponse.json({ offices: enriched })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch offices'
    console.error('Error fetching offices:', error)
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
    const insertData = sanitizeOfficeBody(body)

    if (!insertData.name || typeof insertData.name !== 'string') {
      return NextResponse.json(
        { error: 'Office name is required' },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('offices')
      .insert(insertData)
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

    return NextResponse.json({ office: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create office'
    console.error('Error creating office:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

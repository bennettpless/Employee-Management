import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import {
  ASSET_TYPES,
  DEPARTMENTS,
  DEVICE_STATUSES,
  officeNameToLocation,
  sanitizeDeviceBody,
} from '@/lib/devices'
import { currentActor, logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const searchParams = new URL(request.url).searchParams
    const status = searchParams.get('status')
    const assetType = searchParams.get('asset_type')
    const department = searchParams.get('department')
    const location = searchParams.get('location')

    let query = supabase
      .from('devices')
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .order('asset_tag', { ascending: true, nullsFirst: false })

    if (status && DEVICE_STATUSES.includes(status as any)) {
      query = query.eq('status', status)
    }
    if (assetType && ASSET_TYPES.includes(assetType as any)) {
      query = query.eq('asset_type', assetType)
    }
    if (department) {
      query = query.eq('department', department)
    }
    if (location) {
      query = query.eq('location', location)
    }

    const { data: devices, error } = await query
    if (error) throw error

    // Full inventory scan — used for `flaggedDepartments` / `flaggedLocations`
    // below (those must reflect the entire DB regardless of what the user is
    // currently filtering on) AND as the source for the chip counts.
    const { data: allRows, error: countError } = await supabase
      .from('devices')
      .select('status, asset_type, department, location')
    if (countError) throw countError

    const rows = allRows || []

    // The status count chips at the top of `/devices` reflect the currently
    // applied NON-STATUS filters (asset_type / department / location) so the
    // user sees a status breakdown WITHIN their current filter selection.
    // We deliberately ignore `status` here so the "Repair" chip still tells
    // you how many are in Repair when you've clicked "Active", instead of
    // going to zero. Search is client-side and not applied to chip counts.
    const chipRows = rows.filter((d: any) => {
      if (assetType && d.asset_type !== assetType) return false
      if (department && d.department !== department) return false
      if (location && d.location !== location) return false
      return true
    })

    const counts: Record<string, number> = { all: chipRows.length }
    for (const s of DEVICE_STATUSES) {
      counts[s] = chipRows.filter((d: any) => d.status === s).length
    }
    const typeCounts: Record<string, number> = {}
    for (const t of ASSET_TYPES) {
      typeCounts[t] = chipRows.filter((d: any) => d.asset_type === t).length
    }

    // Phase 21: filter dropdowns are hardcoded to the canonical lists so a
    // one-off typo can't sneak into the filter menu.
    //   - Departments come from `DEPARTMENTS` in `lib/devices.ts`.
    //   - Locations = every office's short name + "Remote".
    // Values already on rows that fall OUTSIDE those sets are returned in
    // `flaggedDepartments` / `flaggedLocations` so the UI can mark those rows
    // for admin cleanup. `null` is treated as "unset" and is NOT flagged.
    const { data: offices } = await supabase.from('offices').select('name')
    const officeLocations = (offices || []).map((o: any) => officeNameToLocation(o.name))
    const locations = Array.from(new Set([...officeLocations, 'Remote'])).sort()

    const canonicalDepartments = new Set<string>(DEPARTMENTS)
    const canonicalLocations = new Set<string>(locations)

    const flaggedDepartments = Array.from(
      new Set(
        rows
          .map((d: any) => d.department)
          .filter(
            (v: unknown): v is string =>
              typeof v === 'string' && v.length > 0 && !canonicalDepartments.has(v)
          )
      )
    ).sort()

    const flaggedLocations = Array.from(
      new Set(
        rows
          .map((d: any) => d.location)
          .filter(
            (v: unknown): v is string =>
              typeof v === 'string' && v.length > 0 && !canonicalLocations.has(v)
          )
      )
    ).sort()

    return NextResponse.json({
      devices: devices || [],
      // `total` is the whole-inventory count (all statuses, all filters
      // ignored) — used for the "showing X of Y" header. `counts.all` is
      // scoped to the currently-applied non-status filters, so it agrees
      // with the "All" chip beneath it.
      total: rows.length,
      counts,
      typeCounts,
      departments: DEPARTMENTS as readonly string[],
      locations,
      flaggedDepartments,
      flaggedLocations,
    })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch devices' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const body = (await request.json()) as Record<string, unknown>

    let insertData: Record<string, unknown>
    try {
      insertData = sanitizeDeviceBody(body)
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }

    if (!insertData.asset_type) {
      return NextResponse.json({ error: 'Asset type is required' }, { status: 400 })
    }
    if (!insertData.status) {
      insertData.status = 'active'
    }
    if (!insertData.device_name) {
      // device_name stays useful for pickers/search; derive a sensible default
      insertData.device_name =
        insertData.asset_tag ||
        [insertData.manufacturer, insertData.model].filter(Boolean).join(' ') ||
        insertData.serial_number ||
        'Unnamed device'
    }

    const { data: device, error } = await supabase
      .from('devices')
      .insert(insertData)
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A device with that asset tag already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    if (device.employee_id) {
      await supabase.from('device_assignments_history').insert({
        device_id: device.id,
        employee_id: device.employee_id,
        assignment_date: new Date().toISOString(),
        is_current: true,
      })
    }

    await logAudit({
      actor: await currentActor(),
      action: 'device.create',
      entity_type: 'device',
      entity_id: device.id,
      entity_label: device.device_name || device.asset_tag || device.serial_number,
      details: {
        ...insertData,
        assigned_to: device.employee?.display_name || device.employee?.email || null,
      },
    })

    return NextResponse.json({ device }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create device' },
      { status: 500 }
    )
  }
}

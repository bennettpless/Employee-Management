import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import {
  ASSET_TYPES,
  DEPARTMENTS,
  DEVICE_STATUSES,
  insertAssignmentHistory,
  officeNameToLocation,
  sanitizeDeviceBody,
} from '@/lib/devices'
import { currentActor, logAudit } from '@/lib/audit'
import {
  employeeSnapshotFrom,
  isoDateOnly,
  loanerFieldsForAssignment,
  openLoanerCheckout,
} from '@/lib/loaner-checkout'
import { consumeSkipError, isStockAssetType, parseChargeOfficeInput } from '@/lib/stock-tracker'
import { fetchLotsWithMetrics, maybeConsumeStockLot, requireChargeOffice } from '@/lib/stock-consume'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    const searchParams = new URL(request.url).searchParams
    const status = searchParams.get('status')
    const assetTypes = searchParams
      .getAll('asset_type')
      .filter((t) => ASSET_TYPES.includes(t as any))
    const departmentFilters = searchParams.getAll('department').filter(Boolean)
    const locationFilters = searchParams.getAll('location').filter(Boolean)

    let query = supabase
      .from('devices')
      .select(`
        *,
        employee:employees(id, display_name, email, first_name, last_name)
      `)
      .order('asset_tag', { ascending: true, nullsFirst: false })

    if (status === 'loaner') {
      query = query.eq('is_loaner', true)
    } else if (status === 'overdue') {
      query = query
        .eq('is_loaner', true)
        .not('employee_id', 'is', null)
        .not('loaner_due_date', 'is', null)
        .lt('loaner_due_date', isoDateOnly())
    } else if (status && DEVICE_STATUSES.includes(status as any)) {
      query = query.eq('status', status)
    }
    if (assetTypes.length) {
      query = query.in('asset_type', assetTypes)
    }
    if (departmentFilters.length) {
      query = query.in('department', departmentFilters)
    }
    if (locationFilters.length) {
      query = query.in('location', locationFilters)
    }

    const { data: devices, error } = await query
    if (error) throw error

    // Full inventory scan — used for `flaggedDepartments` / `flaggedLocations`
    // below (those must reflect the entire DB regardless of what the user is
    // currently filtering on) AND as the source for the chip counts.
    const { data: allRows, error: countError } = await supabase
      .from('devices')
      .select('status, asset_type, department, location, is_loaner, employee_id, loaner_due_date')
    if (countError) throw countError

    const rows = allRows || []

    // The status count chips at the top of `/devices` reflect the currently
    // applied NON-STATUS filters (asset_type / department / location) so the
    // user sees a status breakdown WITHIN their current filter selection.
    // We deliberately ignore `status` here so the "Repair" chip still tells
    // you how many are in Repair when you've clicked "Active", instead of
    // going to zero. Search is client-side and not applied to chip counts.
    const chipRows = rows.filter((d: any) => {
      if (assetTypes.length && !assetTypes.includes(d.asset_type)) return false
      if (departmentFilters.length && !departmentFilters.includes(d.department)) return false
      if (locationFilters.length && !locationFilters.includes(d.location)) return false
      return true
    })

    const counts: Record<string, number> = { all: chipRows.length }
    for (const s of DEVICE_STATUSES) {
      counts[s] = chipRows.filter((d: any) => d.status === s).length
    }
    counts.loaner = chipRows.filter((d: any) => d.is_loaner).length
    const today = isoDateOnly()
    counts.overdue = chipRows.filter(
      (d: any) => d.is_loaner && d.employee_id && d.loaner_due_date && d.loaner_due_date < today
    ).length
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
    const notFromStock = Boolean(body.not_from_stock)
    const lotId = body.lot_id ? String(body.lot_id) : null
    const isPc = isStockAssetType(String(insertData.asset_type || ''))
    const isLoaner = Boolean(insertData.is_loaner)
    let chargeOffice: string | null = null
    if (isPc && !isLoaner && !notFromStock) {
      if (!lotId) {
        return NextResponse.json(
          { error: 'Pick a purchase lot or check Not from stock' },
          { status: 400 }
        )
      }
      const lots = await fetchLotsWithMetrics(supabase)
      const lot = lots.find((l) => l.id === lotId)
      if (!lot) {
        return NextResponse.json({ error: 'Purchase lot not found' }, { status: 400 })
      }
      if (lot.qty_in_stock < 1) {
        return NextResponse.json(
          { error: 'That purchase lot has no remaining quantity' },
          { status: 400 }
        )
      }
      insertData.stock_lot_id = lotId
      if (insertData.employee_id) {
        const charge = await requireChargeOffice(parseChargeOfficeInput(body), supabase)
        if (!charge.ok) {
          return NextResponse.json({ error: charge.error }, { status: 400 })
        }
        chargeOffice = charge.office
      }
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

    const loanerOnCreate = loanerFieldsForAssignment({
      isLoaner: Boolean(insertData.is_loaner),
      nextEmployeeId: (insertData.employee_id as string | null) ?? null,
      dueDate: (insertData.loaner_due_date as string | null) ?? null,
      existingCheckedOutAt: null,
      assigneeChanging: Boolean(insertData.employee_id),
      becomingLoaner: Boolean(insertData.is_loaner),
    })
    insertData.loaner_due_date = loanerOnCreate.loaner_due_date
    insertData.loaner_checked_out_at = loanerOnCreate.loaner_checked_out_at
    if (isPc) {
      insertData.not_from_stock = notFromStock
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
      const snapshot = employeeSnapshotFrom(device.employee)
      await insertAssignmentHistory(supabase, {
        deviceId: device.id,
        employeeId: device.employee_id,
        snapshot,
      })
      if (loanerOnCreate.shouldOpenCheckout) {
        await openLoanerCheckout(supabase, {
          deviceId: device.id,
          employeeId: device.employee_id,
          snapshot,
          dueDate: loanerOnCreate.loaner_due_date,
          checkedOutAt: loanerOnCreate.loaner_checked_out_at || undefined,
        })
      }
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

    let stockLotPrompt = undefined as Awaited<ReturnType<typeof maybeConsumeStockLot>>['prompt']
    if (isPc && !device.is_loaner && !notFromStock && lotId) {
      const consume = await maybeConsumeStockLot(supabase, {
        device,
        nextEmployeeId: device.employee_id,
        actor: await currentActor(),
        force: true,
        lotId,
        chargeOffice,
      })
      const skipError = consumeSkipError(consume.skipped)
      if (skipError) {
        return NextResponse.json({ error: skipError }, { status: 400 })
      }
      stockLotPrompt = consume.prompt
    }

    return NextResponse.json({ device, stock_lot: stockLotPrompt || null }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating device:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create device' },
      { status: 500 }
    )
  }
}

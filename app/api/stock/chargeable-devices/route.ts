import { NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import { getServiceSupabase } from '@/lib/supabase'
import { MANUAL_LOT_CHARGE_TYPES, STOCK_ASSET_TYPES, ymdInTimeZone } from '@/lib/stock-tracker'

const HISTORY_BATCH = 100

/** Assigned stock PCs with no allocation row — e.g. the purchase lot was entered after hand-out. */
export async function GET() {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const supabase = getServiceSupabase()
    const deviceTypes = STOCK_ASSET_TYPES.filter((t) => !MANUAL_LOT_CHARGE_TYPES.includes(t))

    const { data: devices, error } = await supabase
      .from('devices')
      .select(
        `
        id, device_name, asset_tag, serial_number, asset_type, manufacturer, model,
        location, not_from_stock,
        employee:employees(display_name, email, first_name, last_name)
      `
      )
      .in('asset_type', deviceTypes)
      .eq('is_loaner', false)
      .not('employee_id', 'is', null)
    if (error) throw error

    const { data: allocated, error: allocError } = await supabase
      .from('asset_allocations')
      .select('device_id')
      .not('device_id', 'is', null)
    if (allocError) throw allocError
    const allocatedIds = new Set((allocated || []).map((row: { device_id: string }) => row.device_id))

    const candidates = ((devices || []) as any[]).filter((d) => !allocatedIds.has(d.id))
    const ids = candidates.map((d) => d.id)

    const assignedOn = new Map<string, string>()
    // .in() goes in the URL; hundreds of UUIDs exceed the request size limit.
    for (let i = 0; i < ids.length; i += HISTORY_BATCH) {
      const { data: history, error: historyError } = await supabase
        .from('device_assignments_history')
        .select('device_id, assignment_date')
        .in('device_id', ids.slice(i, i + HISTORY_BATCH))
        .eq('is_current', true)
      if (historyError) throw historyError
      for (const row of (history || []) as Array<{ device_id: string; assignment_date: string | null }>) {
        if (!row.assignment_date) continue
        const ymd = ymdInTimeZone(new Date(row.assignment_date))
        const prev = assignedOn.get(row.device_id)
        if (!prev || ymd > prev) assignedOn.set(row.device_id, ymd)
      }
    }

    const rows = candidates
      .map((d) => {
        const employee = d.employee
        const userName =
          employee?.display_name ||
          `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() ||
          employee?.email ||
          null
        return {
          id: d.id,
          device_name: d.device_name || null,
          asset_tag: d.asset_tag || null,
          serial_number: d.serial_number || null,
          asset_type: d.asset_type,
          manufacturer: d.manufacturer || null,
          model: d.model || null,
          location: d.location || null,
          not_from_stock: Boolean(d.not_from_stock),
          user_name: userName,
          assigned_date: assignedOn.get(d.id) || null,
        }
      })
      .sort((a, b) =>
        (a.device_name || a.serial_number || '').localeCompare(b.device_name || b.serial_number || '')
      )

    return NextResponse.json({ devices: rows })
  } catch (error: unknown) {
    const message =
      (error as { message?: string } | null)?.message || 'Failed to load devices'
    console.error('Error listing chargeable devices:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

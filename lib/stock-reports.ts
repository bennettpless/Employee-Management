import { getServiceSupabase } from '@/lib/supabase'
import { groupMonthEndRows, type ReportAllocationRow } from '@/lib/stock-tracker'

type QueryClient = { from: (table: string) => any }

export type ReportAllocation = ReportAllocationRow

export async function fetchAllocationsInRange(
  start: string,
  end: string,
  supabase: QueryClient = getServiceSupabase()
): Promise<ReportAllocation[]> {
  const { data, error } = await supabase
    .from('asset_allocations')
    .select(
      `
      id, lot_id, device_id, assigned_date, office, quantity, unit_cost, allocated_cost, source, created_by, created_at,
      lot:asset_purchase_lots(item_id, purchase_date, manufacturer, model),
      device:devices(
        serial_number,
        employee:employees(display_name, email, first_name, last_name)
      )
    `
    )
    .gte('assigned_date', start)
    .lte('assigned_date', end)
    .order('assigned_date', { ascending: true })
  if (error) throw error

  return ((data || []) as any[]).map((row) => {
    const employee = row.device?.employee
    const userName =
      employee?.display_name ||
      `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() ||
      employee?.email ||
      null
    return {
      id: row.id,
      lot_id: row.lot_id,
      device_id: row.device_id,
      assigned_date: row.assigned_date,
      office: row.office,
      quantity: row.quantity,
      unit_cost: row.unit_cost,
      allocated_cost: row.allocated_cost,
      source: row.source,
      created_by: row.created_by,
      created_at: row.created_at,
      item_id: row.lot?.item_id || 'Unmatched',
      purchase_date: row.lot?.purchase_date || null,
      manufacturer: row.lot?.manufacturer || null,
      model: row.lot?.model || null,
      serial_number: row.device?.serial_number || null,
      user_name: userName,
    } as ReportAllocation
  })
}

export async function fetchAllocationYears(
  supabase: QueryClient = getServiceSupabase()
): Promise<number[]> {
  const { data, error } = await supabase.from('asset_allocations').select('assigned_date')
  if (error) throw error
  const years = new Set<number>()
  for (const row of data || []) {
    const y = Number(String(row.assigned_date).slice(0, 4))
    if (Number.isFinite(y)) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

export function reportGroupsFor(rows: ReportAllocation[]) {
  return groupMonthEndRows(rows)
}

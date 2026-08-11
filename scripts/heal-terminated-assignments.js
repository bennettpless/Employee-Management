/**
 * Unassign devices still pointing at terminated employees, and close any
 * orphaned is_current assignment-history rows.
 *
 * Usage: node scripts/heal-terminated-assignments.js
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

const root = path.resolve(__dirname, '..')
loadEnv(path.join(root, '.env.local'))
loadEnv(path.join(root, '.env'))

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const now = new Date().toISOString()

  const { data: terminated, error: e1 } = await sb
    .from('employees')
    .select('id, display_name, email')
    .eq('employment_status', 'terminated')
  if (e1) throw e1

  const termIds = (terminated || []).map((e) => e.id)
  let unassigned = 0
  let historyClosedForTerminated = 0

  if (termIds.length > 0) {
    const { data: devices, error: e2 } = await sb
      .from('devices')
      .select('id')
      .in('employee_id', termIds)
    if (e2) throw e2

    for (const d of devices || []) {
      await sb
        .from('device_assignments_history')
        .update({ is_current: false, unassignment_date: now })
        .eq('device_id', d.id)
        .eq('is_current', true)
      const { error: uErr } = await sb
        .from('devices')
        .update({ employee_id: null, status: 'in_stock' })
        .eq('id', d.id)
      if (uErr) throw uErr
      unassigned++
    }

    // Also close any remaining is_current history rows for terminated people
    // (device may already have been reassigned to someone else).
    const { data: staleHist, error: e3 } = await sb
      .from('device_assignments_history')
      .select('id')
      .eq('is_current', true)
      .in('employee_id', termIds)
    if (e3) throw e3
    if (staleHist?.length) {
      const { error: hErr } = await sb
        .from('device_assignments_history')
        .update({ is_current: false, unassignment_date: now })
        .in(
          'id',
          staleHist.map((h) => h.id)
        )
      if (hErr) throw hErr
      historyClosedForTerminated = staleHist.length
    }
  }

  // Orphans: is_current but history employee ≠ devices.employee_id
  const { data: currentHist, error: e4 } = await sb
    .from('device_assignments_history')
    .select('id, employee_id, device:devices(employee_id)')
    .eq('is_current', true)
  if (e4) throw e4

  const orphanIds = (currentHist || [])
    .filter((h) => !h.device?.employee_id || h.device.employee_id !== h.employee_id)
    .map((h) => h.id)

  let orphansClosed = 0
  if (orphanIds.length > 0) {
    const { error: oErr } = await sb
      .from('device_assignments_history')
      .update({ is_current: false, unassignment_date: now })
      .in('id', orphanIds)
    if (oErr) throw oErr
    orphansClosed = orphanIds.length
  }

  console.log(
    JSON.stringify(
      {
        terminatedEmployees: termIds.length,
        devicesUnassignedFromTerminated: unassigned,
        historyClosedForTerminated,
        orphanHistoryClosed: orphansClosed,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

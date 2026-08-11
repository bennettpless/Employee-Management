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
  const heal = process.argv.includes('--heal')
  const { data: hist, error } = await sb
    .from('device_assignments_history')
    .select(
      `
      id,
      device_id,
      employee_id,
      is_current,
      assignment_date,
      employee:employees(display_name, email, employment_status),
      device:devices(id, device_name, employee_id, serial_number)
    `
    )
    .eq('is_current', true)

  if (error) throw error

  const orphans = (hist || []).filter(
    (h) => !h.device?.employee_id || h.device.employee_id !== h.employee_id
  )

  console.log(
    JSON.stringify(
      {
        totalCurrent: (hist || []).length,
        orphanCount: orphans.length,
        orphans: orphans.map((h) => ({
          historyId: h.id,
          device: h.device?.device_name,
          serial: h.device?.serial_number,
          deviceEmployeeId: h.device?.employee_id,
          historyEmployee: h.employee?.display_name || h.employee?.email,
          empStatus: h.employee?.employment_status,
        })),
      },
      null,
      2
    )
  )

  if (heal && orphans.length > 0) {
    const now = new Date().toISOString()
    const ids = orphans.map((h) => h.id)
    const { error: updErr } = await sb
      .from('device_assignments_history')
      .update({ is_current: false, unassignment_date: now })
      .in('id', ids)
    if (updErr) throw updErr
    console.log(`Healed ${ids.length} orphaned current assignment row(s).`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

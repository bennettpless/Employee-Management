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
  const { data: emps, error: e1 } = await sb
    .from('employees')
    .select('id, display_name, email, employment_status')
    .eq('employment_status', 'terminated')
  if (e1) throw e1

  const ids = (emps || []).map((e) => e.id)
  if (ids.length === 0) {
    console.log(JSON.stringify({ terminatedEmployees: 0, stillAssignedDevices: [] }, null, 2))
    return
  }

  const { data: devices, error: e2 } = await sb
    .from('devices')
    .select('id, device_name, serial_number, status, employee_id')
    .in('employee_id', ids)
  if (e2) throw e2

  const byId = new Map((emps || []).map((e) => [e.id, e]))
  const rows = (devices || []).map((d) => {
    const emp = byId.get(d.employee_id)
    return {
      device_id: d.id,
      device_name: d.device_name,
      serial: d.serial_number,
      status: d.status,
      employee: emp?.display_name || emp?.email,
      employee_id: d.employee_id,
    }
  })

  // Also: terminated people still marked is_current in history
  const { data: hist } = await sb
    .from('device_assignments_history')
    .select(
      'id, device_id, employee_id, device:devices(device_name, employee_id), employee:employees(display_name, employment_status)'
    )
    .eq('is_current', true)
    .in('employee_id', ids)

  console.log(
    JSON.stringify(
      {
        terminatedEmployees: ids.length,
        devicesStillPointingAtTerminated: rows.length,
        devices: rows,
        historyStillCurrentForTerminated: (hist || []).length,
        history: (hist || []).map((h) => ({
          historyId: h.id,
          historyEmployee: h.employee?.display_name,
          device: h.device?.device_name,
          deviceCurrentlyAssignedToId: h.device?.employee_id,
        })),
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

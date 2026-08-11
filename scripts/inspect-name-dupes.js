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

async function deviceCount(employeeId) {
  const { count } = await sb
    .from('devices')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
  return count || 0
}

async function histCount(employeeId) {
  const { count } = await sb
    .from('device_assignments_history')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
  return count || 0
}

async function main() {
  const { data: mike, error: e1 } = await sb
    .from('employees')
    .select(
      'id, email, display_name, first_name, last_name, employment_status, entra_id, username'
    )
    .or(
      'display_name.ilike.%mccusker%,last_name.ilike.%mccusker%,email.ilike.%mccusker%'
    )
  if (e1) throw e1

  const { data: charles, error: e2 } = await sb
    .from('employees')
    .select(
      'id, email, display_name, first_name, last_name, employment_status, entra_id, username'
    )
    .or(
      'display_name.ilike.%warren%,last_name.ilike.%warren%,email.ilike.%warren%'
    )
  if (e2) throw e2

  const enrich = async (rows) =>
    Promise.all(
      (rows || []).map(async (r) => ({
        ...r,
        devices: await deviceCount(r.id),
        history: await histCount(r.id),
      }))
    )

  console.log(
    JSON.stringify(
      {
        mccusker: await enrich(mike),
        warren: await enrich(charles),
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

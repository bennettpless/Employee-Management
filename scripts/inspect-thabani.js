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
  const { data, error } = await sb
    .from('employees')
    .select(
      'id, email, display_name, first_name, last_name, employment_status, entra_id, username'
    )
    .or(
      'display_name.ilike.%thabani%,last_name.ilike.%banda%,email.ilike.%banda%,email.ilike.%thabani%'
    )
  if (error) throw error

  const rows = []
  for (const r of data || []) {
    const { count: devices } = await sb
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', r.id)
    const { count: history } = await sb
      .from('device_assignments_history')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', r.id)
    rows.push({ ...r, devices: devices || 0, history: history || 0 })
  }
  console.log(JSON.stringify(rows, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

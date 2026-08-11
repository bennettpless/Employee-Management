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
  const keepEmail = 'tbanda@bpl-enclosure.com'
  const dropEmail = 'tbana@bpl-enclosure.com'

  const { data: keep } = await sb
    .from('employees')
    .select('id, email, display_name')
    .eq('email', keepEmail)
    .maybeSingle()
  const { data: drop } = await sb
    .from('employees')
    .select('id, email, display_name')
    .eq('email', dropEmail)
    .maybeSingle()

  if (!keep) throw new Error(`Keep row not found: ${keepEmail}`)
  if (!drop) {
    console.log(`Duplicate already gone: ${dropEmail}`)
  } else {
    const { count } = await sb
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', drop.id)
    if ((count || 0) > 0) {
      throw new Error(`Refusing to delete ${dropEmail}: still has devices`)
    }
    await sb.from('pending_device_lookups').delete().eq('employee_id', drop.id)
    const { error } = await sb.from('employees').delete().eq('id', drop.id)
    if (error) throw error
    console.log(`Deleted duplicate: ${drop.display_name} <${drop.email}>`)
  }

  console.log(`Kept: ${keep.display_name} <${keep.email}>`)

  const { data: remaining } = await sb
    .from('employees')
    .select('email, display_name, username')
    .or('email.ilike.%banda%,email.ilike.%tbana%,display_name.ilike.%thabani%')
  console.log('Remaining:', remaining)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

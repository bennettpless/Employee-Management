/**
 * - Remove duplicate Mike McCusker (mcusker@…); keep mmccusker@…
 * - Rename Charles Warren display_name → Chad Warren
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
  const keepEmail = 'mmccusker@bennett-pless.com'
  const dropEmail = 'mcusker@bennett-pless.com'

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
    const { count: deviceCount } = await sb
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('employee_id', drop.id)
    if ((deviceCount || 0) > 0) {
      throw new Error(
        `Refusing to delete ${dropEmail}: still has ${deviceCount} device(s). Reassign first.`
      )
    }

    // Clear any pending lookups tied to the bad row
    await sb.from('pending_device_lookups').delete().eq('employee_id', drop.id)

    const { error: delErr } = await sb.from('employees').delete().eq('id', drop.id)
    if (delErr) throw delErr
    console.log(`Deleted duplicate: ${drop.display_name} <${drop.email}> (${drop.id})`)
    console.log(`Kept: ${keep.display_name} <${keep.email}> (${keep.id})`)
  }

  const { data: warren, error: wErr } = await sb
    .from('employees')
    .update({
      display_name: 'Chad Warren',
      first_name: 'Chad',
    })
    .eq('email', 'cwarren@bennett-pless.com')
    .select('id, email, display_name, first_name, last_name')
    .maybeSingle()
  if (wErr) throw wErr
  if (!warren) throw new Error('Chad/Charles Warren row not found (cwarren@…)')
  console.log('Renamed Warren →', warren)

  // Verify
  const { data: mikes } = await sb
    .from('employees')
    .select('email, display_name')
    .ilike('last_name', '%mccusker%')
  console.log('McCusker rows now:', mikes)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

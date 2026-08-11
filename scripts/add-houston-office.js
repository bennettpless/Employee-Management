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
  const { data: existing } = await sb
    .from('offices')
    .select('id, name')
    .ilike('name', '%houston%')

  if (existing && existing.length > 0) {
    console.log('Houston already exists:', existing)
    return
  }

  // City-level coords so it appears on the network map; address can be
  // filled in later at /settings/offices.
  const { data, error } = await sb
    .from('offices')
    .insert({
      name: 'Houston Office',
      city: 'Houston',
      state: 'Texas',
      country: 'USA',
      latitude: 29.7604267,
      longitude: -95.3698028,
      status: 'online',
    })
    .select()
    .single()

  if (error) throw error
  console.log('Created:', JSON.stringify(data, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * One-off: list devices with duplicate serial_number / device_name / ninja_device_id.
 * Usage: node scripts/find-duplicate-devices.js
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)
const PLACEHOLDER_RE =
  /^(to be filled|to be filled by o\.?e\.?m\.?|default string|none|n\/?a|unknown|0+|system serial number|not specified|not available)$/i

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
}

async function main() {
  let all = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await sb
      .from('devices')
      .select(
        'id, device_name, serial_number, ninja_device_id, asset_tag, status, employee_id, manufacturer, model, asset_type, is_in_ninja, notes, created_at'
      )
      .range(from, from + page - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < page) break
    from += page
  }

  const empIds = [...new Set(all.map((d) => d.employee_id).filter(Boolean))]
  const empMap = new Map()
  for (let i = 0; i < empIds.length; i += 100) {
    const chunk = empIds.slice(i, i + 100)
    const { data: emps } = await sb
      .from('employees')
      .select('id, display_name, email')
      .in('id', chunk)
    for (const e of emps || []) {
      empMap.set(e.id, e.display_name || e.email || e.id)
    }
  }

  const bySerial = new Map()
  const byName = new Map()
  const byNinja = new Map()
  let emptySerial = 0

  for (const d of all) {
    const s = norm(d.serial_number)
    if (!s || s.length < 4) emptySerial++
    else {
      if (!bySerial.has(s)) bySerial.set(s, [])
      bySerial.get(s).push(d)
    }
    const n = norm(d.device_name)
    if (n) {
      if (!byName.has(n)) byName.set(n, [])
      byName.get(n).push(d)
    }
    if (d.ninja_device_id) {
      const nid = String(d.ninja_device_id)
      if (!byNinja.has(nid)) byNinja.set(nid, [])
      byNinja.get(nid).push(d)
    }
  }

  const mapDev = (d) => ({
    id: d.id,
    device_name: d.device_name || '',
    serial_number: d.serial_number || '',
    ninja_device_id: d.ninja_device_id || '',
    asset_tag: d.asset_tag || '',
    status: d.status || '',
    asset_type: d.asset_type || '',
    make_model: [d.manufacturer, d.model].filter(Boolean).join(' '),
    assigned_to: d.employee_id
      ? empMap.get(d.employee_id) || d.employee_id
      : '',
    is_in_ninja: !!d.is_in_ninja,
    notes: String(d.notes || '').slice(0, 120),
    created_at: d.created_at || '',
  })

  const serialDupes = [...bySerial.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort(
      (a, b) =>
        b[1].length - a[1].length || a[0].localeCompare(b[0])
    )
    .map(([serial, rows]) => ({
      serial: rows[0].serial_number || serial,
      serialKey: serial,
      count: rows.length,
      looksPlaceholder: PLACEHOLDER_RE.test(serial),
      devices: rows
        .map(mapDev)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
    }))

  const nameDupes = [...byName.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([, rows]) => ({
      device_name: rows[0].device_name || '',
      count: rows.length,
      devices: rows.map(mapDev),
    }))

  const ninjaDupes = [...byNinja.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([nid, rows]) => ({
      ninja_device_id: nid,
      count: rows.length,
      devices: rows.map(mapDev),
    }))

  const out = {
    generatedAt: new Date().toISOString(),
    totalDevices: all.length,
    emptyOrShortSerial: emptySerial,
    duplicateSerialGroups: serialDupes.length,
    duplicateSerialDeviceCount: serialDupes.reduce((n, g) => n + g.count, 0),
    placeholderSerialGroups: serialDupes.filter((g) => g.looksPlaceholder)
      .length,
    realSerialDupGroups: serialDupes.filter((g) => !g.looksPlaceholder).length,
    duplicateNameGroups: nameDupes.length,
    duplicateNinjaIdGroups: ninjaDupes.length,
    serialDupes,
    nameDupes,
    ninjaDupes,
  }

  const outPath = path.join(root, 'tmp-duplicate-devices.json')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(
    JSON.stringify(
      {
        outPath,
        totalDevices: out.totalDevices,
        emptyOrShortSerial: out.emptyOrShortSerial,
        duplicateSerialGroups: out.duplicateSerialGroups,
        duplicateSerialDeviceCount: out.duplicateSerialDeviceCount,
        placeholderSerialGroups: out.placeholderSerialGroups,
        realSerialDupGroups: out.realSerialDupGroups,
        duplicateNameGroups: out.duplicateNameGroups,
        duplicateNinjaIdGroups: out.duplicateNinjaIdGroups,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

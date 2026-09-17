/**
 * One-time backfill of phone_number / extension from a Dialpad user export.
 *
 * Matches CSV rows (type=user) to employees by email. Only fills fields that
 * are currently EMPTY in the database — existing values are never overwritten.
 *
 * Usage:
 *   node scripts/backfill-dialpad.js <path-to-dialpad-csv>           # dry run (default)
 *   node scripts/backfill-dialpad.js <path-to-dialpad-csv> --apply   # write changes
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

/** Minimal CSV parser that handles quoted fields (Dialpad quotes multi-number cells). */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

/**
 * First number from the cell, formatted like the rest of the DB: (XXX) XXX-XXXX.
 * Dialpad exports 11-digit numbers with a leading 1 country code.
 */
function normalizePhone(raw) {
  const first = String(raw || '').split(',')[0].trim()
  if (!first) return null
  let digits = first.replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return first || null
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const csvPath = args.find((a) => !a.startsWith('--'))
  if (!csvPath) throw new Error('Usage: node scripts/backfill-dialpad.js <csv> [--apply]')

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name) => header.indexOf(name)
  const iType = col('type')
  const iEmail = col('primary_email')
  const iName = col('name')
  const iPhones = col('phone_numbers')
  const iExt = col('extension')

  const csvUsers = new Map()
  for (const r of rows.slice(1)) {
    if (String(r[iType]).trim() !== 'user') continue
    const email = String(r[iEmail] || '').trim().toLowerCase()
    if (!email) continue
    csvUsers.set(email, {
      name: String(r[iName] || '').trim(),
      phone: normalizePhone(r[iPhones]),
      extension: String(r[iExt] || '').trim() || null,
    })
  }

  const { data: employees, error } = await sb
    .from('employees')
    .select('id, email, display_name, phone_number, extension, employment_status')
  if (error) throw error

  const updates = []
  const matchedNoChange = []
  const unmatchedEmployees = []
  const matchedEmails = new Set()

  for (const emp of employees) {
    const email = String(emp.email || '').trim().toLowerCase()
    const dialpad = email ? csvUsers.get(email) : null
    if (!dialpad) {
      unmatchedEmployees.push(emp)
      continue
    }
    matchedEmails.add(email)

    const patch = {}
    const hasPhone = String(emp.phone_number || '').trim() !== ''
    const hasExt = String(emp.extension || '').trim() !== ''
    if (!hasPhone && dialpad.phone) patch.phone_number = dialpad.phone
    if (!hasExt && dialpad.extension) patch.extension = dialpad.extension

    if (Object.keys(patch).length > 0) {
      updates.push({ emp, patch })
    } else {
      matchedNoChange.push(emp)
    }
  }

  const unmatchedCsv = [...csvUsers.entries()].filter(([e]) => !matchedEmails.has(e))

  console.log(`Dialpad CSV users (type=user, with email): ${csvUsers.size}`)
  console.log(`Employees in DB: ${employees.length}`)
  console.log(`Matched, already complete (no change): ${matchedNoChange.length}`)
  console.log(`Matched, needs update: ${updates.length}`)
  console.log(`Employees NOT in Dialpad CSV: ${unmatchedEmployees.length}`)
  console.log(`Dialpad users NOT in DB: ${unmatchedCsv.length}`)
  console.log('')

  if (updates.length > 0) {
    console.log('--- Updates ' + (apply ? '(APPLYING)' : '(dry run)') + ' ---')
    for (const { emp, patch } of updates) {
      const parts = []
      if (patch.phone_number) parts.push(`phone: ${emp.phone_number || '(empty)'} -> ${patch.phone_number}`)
      if (patch.extension) parts.push(`ext: ${emp.extension || '(empty)'} -> ${patch.extension}`)
      console.log(`  ${emp.display_name} <${emp.email}>  ${parts.join('  |  ')}`)
    }
  }

  if (unmatchedEmployees.length > 0) {
    console.log('\n--- Employees with no Dialpad match (left untouched) ---')
    for (const emp of unmatchedEmployees) {
      console.log(`  ${emp.display_name} <${emp.email}> [${emp.employment_status}]`)
    }
  }

  if (unmatchedCsv.length > 0) {
    console.log('\n--- Dialpad users not found in the program ---')
    for (const [email, u] of unmatchedCsv) {
      console.log(`  ${u.name} <${email}>`)
    }
  }

  if (!apply) {
    console.log('\nDry run only — re-run with --apply to write these changes.')
    return
  }

  let ok = 0
  for (const { emp, patch } of updates) {
    const { error: upErr } = await sb.from('employees').update(patch).eq('id', emp.id)
    if (upErr) {
      console.error(`  FAILED ${emp.email}: ${upErr.message}`)
    } else {
      ok++
    }
  }
  console.log(`\nApplied ${ok}/${updates.length} updates.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

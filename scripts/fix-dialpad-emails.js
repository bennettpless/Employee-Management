/**
 * One-time follow-up to the Dialpad backfill (2026-08-12).
 *
 * Six employees didn't match the Dialpad export by email. Per Destiny's
 * review they are all the same people; four program emails were wrong and
 * two were correct (Dialpad has the wrong address for those).
 *
 * This script fixes the wrong program emails (email + entra_id, which the
 * app keeps identical) and fills in missing phone_number / extension from
 * the Dialpad CSV. Existing values are never overwritten.
 *
 * Usage:
 *   node scripts/fix-dialpad-emails.js <path-to-dialpad-csv>           # dry run
 *   node scripts/fix-dialpad-emails.js <path-to-dialpad-csv> --apply
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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

// currentEmail = what's in the DB now; newEmail = correction (null = DB is right);
// csvEmail = the row in the Dialpad export that belongs to this person.
const FIXES = [
  { currentEmail: 'rkrug@bpl-enlcosure.com', newEmail: 'rkrug@bpl-enclosure.com', csvEmail: 'rkrug@bpl-enclosure.com' },
  { currentEmail: 'vmartinez@bennett-pless.com', newEmail: 'vmartinez@bpl-enclosure.com', csvEmail: 'vmartinez@bpl-enclosure.com' },
  { currentEmail: 'nverma@bennett-pless.com', newEmail: 'nverma@bpl-enclosure.com', csvEmail: 'nverma@bpl-enclosure.com' },
  { currentEmail: 'svicino@bennett-pless.com', newEmail: 'svicino@bpl-enclosure.com', csvEmail: 'svicino@bpl-enclosure.com' },
  { currentEmail: 'yayaz@bennett-pless.com', newEmail: null, csvEmail: 'yaya@bennett-pless.com' },
  { currentEmail: 'rkoch@bpl-enclosure.com', newEmail: null, csvEmail: 'rkoch@bennett-pless.com' },
]

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
  if (!csvPath) throw new Error('Usage: node scripts/fix-dialpad-emails.js <csv> [--apply]')

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const iType = header.indexOf('type')
  const iEmail = header.indexOf('primary_email')
  const iPhones = header.indexOf('phone_numbers')
  const iExt = header.indexOf('extension')

  const csvByEmail = new Map()
  for (const r of rows.slice(1)) {
    if (String(r[iType]).trim() !== 'user') continue
    const email = String(r[iEmail] || '').trim().toLowerCase()
    if (!email) continue
    csvByEmail.set(email, {
      phone: normalizePhone(r[iPhones]),
      extension: String(r[iExt] || '').trim() || null,
    })
  }

  for (const fix of FIXES) {
    const { data: emp, error } = await sb
      .from('employees')
      .select('id, email, entra_id, display_name, phone_number, extension')
      .eq('email', fix.currentEmail)
      .maybeSingle()
    if (error) throw error
    if (!emp) {
      console.log(`SKIP: no employee with email ${fix.currentEmail}`)
      continue
    }

    const dialpad = csvByEmail.get(fix.csvEmail)
    if (!dialpad) {
      console.log(`SKIP: no Dialpad CSV row for ${fix.csvEmail}`)
      continue
    }

    const patch = {}
    if (fix.newEmail && fix.newEmail !== emp.email) {
      patch.email = fix.newEmail
      patch.entra_id = fix.newEmail
    }
    if (!String(emp.phone_number || '').trim() && dialpad.phone) patch.phone_number = dialpad.phone
    if (!String(emp.extension || '').trim() && dialpad.extension) patch.extension = dialpad.extension

    if (Object.keys(patch).length === 0) {
      console.log(`OK (no change): ${emp.display_name} <${emp.email}>`)
      continue
    }

    const parts = []
    if (patch.email) parts.push(`email: ${emp.email} -> ${patch.email}`)
    if (patch.phone_number) parts.push(`phone: ${emp.phone_number || '(empty)'} -> ${patch.phone_number}`)
    if (patch.extension) parts.push(`ext: ${emp.extension || '(empty)'} -> ${patch.extension}`)
    console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${emp.display_name}  ${parts.join('  |  ')}`)

    if (apply) {
      const { error: upErr } = await sb.from('employees').update(patch).eq('id', emp.id)
      if (upErr) console.error(`  FAILED: ${upErr.message}`)
    }
  }

  if (!apply) console.log('\nDry run only — re-run with --apply to write these changes.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

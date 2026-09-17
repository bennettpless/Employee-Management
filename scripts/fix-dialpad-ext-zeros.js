/**
 * One-time follow-up to the Dialpad backfill (2026-08-12).
 *
 * Extensions in the Dialpad export that are exactly 3 digits lost their
 * leading zero when the sheet went through Excel. The real extension is
 * 0XXX. This script finds employees matched to those Dialpad rows and
 * prefixes the zero in the program.
 *
 * Only rows whose current program extension equals the stripped 3-digit
 * value (or is empty) are changed; anything else is reported and skipped.
 *
 * Usage:
 *   node scripts/fix-dialpad-ext-zeros.js <path-to-dialpad-csv>           # dry run
 *   node scripts/fix-dialpad-ext-zeros.js <path-to-dialpad-csv> --apply
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

// Dialpad has the wrong email for these two people (program is correct).
const CSV_EMAIL_ALIASES = new Map([
  ['yaya@bennett-pless.com', 'yayaz@bennett-pless.com'],
  ['rkoch@bennett-pless.com', 'rkoch@bpl-enclosure.com'],
])

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

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const csvPath = args.find((a) => !a.startsWith('--'))
  if (!csvPath) throw new Error('Usage: node scripts/fix-dialpad-ext-zeros.js <csv> [--apply]')

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const iType = header.indexOf('type')
  const iEmail = header.indexOf('primary_email')
  const iExt = header.indexOf('extension')

  // Program email -> 3-digit Dialpad extension
  const threeDigitExt = new Map()
  for (const r of rows.slice(1)) {
    if (String(r[iType]).trim() !== 'user') continue
    let email = String(r[iEmail] || '').trim().toLowerCase()
    if (!email) continue
    email = CSV_EMAIL_ALIASES.get(email) || email
    const ext = String(r[iExt] || '').trim()
    if (/^\d{3}$/.test(ext)) threeDigitExt.set(email, ext)
  }
  console.log(`Dialpad users with 3-digit extensions: ${threeDigitExt.size}`)

  const { data: employees, error } = await sb
    .from('employees')
    .select('id, email, display_name, extension')
  if (error) throw error

  let fixed = 0
  let alreadyDone = 0
  const mismatches = []
  for (const emp of employees) {
    const email = String(emp.email || '').trim().toLowerCase()
    const ext = threeDigitExt.get(email)
    if (!ext) continue
    const target = `0${ext}`
    const current = String(emp.extension || '').trim()

    if (current === target) {
      alreadyDone++
      continue
    }
    if (current !== '' && current !== ext) {
      mismatches.push(`  SKIP ${emp.display_name} <${emp.email}>: program has "${current}", Dialpad has "${ext}"`)
      continue
    }

    console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${emp.display_name} <${emp.email}>  ext: ${current || '(empty)'} -> ${target}`)
    if (apply) {
      const { error: upErr } = await sb
        .from('employees')
        .update({ extension: target })
        .eq('id', emp.id)
      if (upErr) {
        console.error(`  FAILED: ${upErr.message}`)
        continue
      }
    }
    fixed++
  }

  if (mismatches.length > 0) {
    console.log('\n--- Skipped (program value differs from Dialpad) ---')
    for (const m of mismatches) console.log(m)
  }

  console.log(`\n${apply ? 'Fixed' : 'Would fix'}: ${fixed}   Already correct: ${alreadyDone}`)
  if (!apply) console.log('Dry run only — re-run with --apply to write these changes.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

import type { AssetType, DeviceStatus } from './types'

export const ASSET_TYPES: AssetType[] = ['laptop', 'desktop', 'monitor', 'tv', 'printer', 'server', 'other']
export const DEVICE_STATUSES: DeviceStatus[] = ['active', 'in_stock', 'repair', 'decommissioned']

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  laptop: 'Laptop',
  desktop: 'Desktop',
  monitor: 'Monitor',
  tv: 'TV',
  printer: 'Printer',
  server: 'Server',
  other: 'Other',
}

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  active: 'Active',
  in_stock: 'In Stock',
  repair: 'Repair',
  decommissioned: 'Decommissioned',
}

/**
 * Canonical list of departments used across `/devices` filters and the
 * onboarding sync's auto-assign logic. Order is intentional (alphabetical) —
 * the filter dropdown renders them in this order and `Department` is derived
 * from this tuple to keep the type in sync.
 *
 * Any `devices.department` value not in this list is treated as
 * "non-canonical" and flagged in the UI for admin cleanup.
 */
export const DEPARTMENTS = [
  'Admin',
  'BPL',
  'Designer',
  'Engineer',
  'Leadership',
] as const

export type Department = (typeof DEPARTMENTS)[number]

// Matches senior-leadership job titles. Word-boundary anchored so a Marketing
// Manager isn't caught by "manager" alone — only "Department Manager" does.
// Runs BEFORE the Engineer/Designer rules so a "VP of Engineering" files
// under Leadership rather than Engineer.
const LEADERSHIP_TITLE_RE =
  /\b(?:department\s+manager|executive|director|vice\s+president|vp|president)\b/i

/**
 * Derive a device department from the assigned employee's job title. Applies
 * rules in this priority order — see `docs/employee-management-system/21-filter-hardening.md`
 * for the rationale:
 *   1. Leadership titles (VP / President / Director / Executive / Department Manager)
 *   2. "engineer" anywhere in the title → Engineer
 *   3. "BIM" as a word → Designer
 *   4. anything else → Admin (default fallback covers IT, accounting, receptionist, etc.)
 *
 * Always returns one of the canonical `Department` values — never `null`. Admins
 * can still override on any individual device via the edit modal.
 */
export function departmentFromTitle(title: string | null | undefined): Department {
  const t = String(title ?? '')
  if (LEADERSHIP_TITLE_RE.test(t)) return 'Leadership'
  if (/engineer/i.test(t)) return 'Engineer'
  if (/\bBIM\b/i.test(t)) return 'Designer'
  return 'Admin'
}

/**
 * Derive a device department from the assigned employee. BPL (bpl-enclosure)
 * staff always file under BPL regardless of title; otherwise the job title
 * decides via `departmentFromTitle`.
 *
 * Always returns one of the canonical `Department` values.
 */
export function departmentForEmployee(
  email: string | null | undefined,
  title: string | null | undefined
): Department {
  if (String(email ?? '').toLowerCase().endsWith('@bpl-enclosure.com')) return 'BPL'
  return departmentFromTitle(title)
}

/**
 * Convert an office name ("Charlotte Office") into the short location value
 * used on device records ("Charlotte"). The Florida offices (Orlando,
 * Sarasota) are grouped under a single "Florida" location.
 */
export function officeNameToLocation(name: string): string {
  const short = String(name).replace(/\s+Office$/i, '').trim()
  if (/^(orlando|sarasota)$/i.test(short)) return 'Florida'
  return short
}

/**
 * Display make + model without duplicating the manufacturer when the model
 * already starts with it (e.g. make "HP" + model "HP Color LaserJet Pro"
 * → "HP Color LaserJet Pro", not "HP HP Color LaserJet Pro").
 */
export function formatMakeModel(
  manufacturer: string | null | undefined,
  model: string | null | undefined
): string {
  const make = String(manufacturer ?? '').trim()
  const mod = String(model ?? '').trim()
  if (!make && !mod) return ''
  if (!make) return mod
  if (!mod) return make
  if (mod.toLowerCase().startsWith(make.toLowerCase())) return mod
  return `${make} ${mod}`
}

const EDITABLE_FIELDS = [
  'device_name',
  'manufacturer',
  'model',
  'serial_number',
  'asset_tag',
  'asset_type',
  'department',
  'location',
  'commissioned_at',
  'decommissioned_at',
  'warranty_months',
  'warranty_end',
  'notes',
  'status',
  'employee_id',
] as const

/**
 * Close every open assignment-history row for a device. `devices.employee_id`
 * is the source of truth for who is assigned; history `is_current` must not
 * outlive that (or claim a different person).
 */
export async function closeCurrentAssignments(
  supabase: { from: (table: string) => any },
  deviceId: string,
  unassignmentDate: string = new Date().toISOString()
) {
  return supabase
    .from('device_assignments_history')
    .update({ is_current: false, unassignment_date: unassignmentDate })
    .eq('device_id', deviceId)
    .eq('is_current', true)
}

/**
 * Whitelist + normalize a request body for insert/update on the devices
 * table. Empty strings become NULL. Throws on invalid enum values.
 */
export function sanitizeDeviceBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue
    const raw = body[field]
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      out[field] = trimmed.length === 0 ? null : trimmed
    } else {
      out[field] = raw ?? null
    }
  }

  if ('warranty_months' in out && out.warranty_months !== null) {
    const n = Number(out.warranty_months)
    out.warranty_months = Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  if ('asset_type' in out && out.asset_type !== null && !ASSET_TYPES.includes(out.asset_type as AssetType)) {
    throw new Error(`Invalid asset_type. Must be one of: ${ASSET_TYPES.join(', ')}`)
  }
  if ('status' in out && !DEVICE_STATUSES.includes(out.status as DeviceStatus)) {
    throw new Error(`Invalid status. Must be one of: ${DEVICE_STATUSES.join(', ')}`)
  }
  return out
}

/**
 * Build case-insensitive lookup maps for matching free-text user names/emails
 * from spreadsheets to employee records.
 */
export function buildEmployeeMatcher(
  employees: Array<{ id: string; email: string | null; display_name: string | null; first_name: string | null; last_name: string | null }>
) {
  const byEmail = new Map<string, string>()
  const byName = new Map<string, string>()
  // Email local parts (e.g. "jli" from jli@…) — company convention is
  // first initial + last name, which lets us match preferred/nickname
  // spellings like "Jack Li" → Shuang "Jack" Li (jli@…). Ambiguous local
  // parts are dropped.
  const byEmailLocal = new Map<string, string | null>()

  const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

  for (const emp of employees) {
    if (emp.email) {
      const email = emp.email.trim().toLowerCase()
      byEmail.set(email, emp.id)
      const local = nameKey(email.split('@')[0])
      if (local) byEmailLocal.set(local, byEmailLocal.has(local) ? null : emp.id)
    }
    if (emp.display_name) byName.set(nameKey(emp.display_name), emp.id)
    const firstLast = `${emp.first_name || ''}${emp.last_name || ''}`
    if (firstLast) byName.set(nameKey(firstLast), emp.id)
  }

  const initialLastKey = (first: string, last: string): string | null => {
    const f = nameKey(first)
    const l = nameKey(last)
    return f && l ? `${f[0]}${l}` : null
  }

  return (raw: string): string | null => {
    const value = (raw || '').trim()
    if (!value) return null
    const lower = value.toLowerCase()
    if (['n/a', 'na', 'none', 'loaner', 'spare', 'unknown', '?'].includes(lower)) return null
    if (lower.includes('@')) {
      return byEmail.get(lower) ?? null
    }
    // Handle "Last, First" as well as "First Last"
    const key = nameKey(value)
    if (byName.has(key)) return byName.get(key)!
    let first: string | null = null
    let last: string | null = null
    if (value.includes(',')) {
      ;[last, first] = value.split(',').map((p) => p.trim())
      const flipped = nameKey(`${first} ${last}`)
      if (byName.has(flipped)) return byName.get(flipped)!
    } else {
      const parts = value.split(/\s+/)
      if (parts.length >= 2) {
        first = parts[0]
        last = parts[parts.length - 1]
      }
    }
    // Fallback: first initial + last name against unique email local parts
    if (first && last) {
      const localKey = initialLastKey(first, last)
      const match = localKey ? byEmailLocal.get(localKey) : null
      if (match) return match
    }
    return null
  }
}

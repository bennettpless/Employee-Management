import type { NetworkDevice, Office } from './types'

/**
 * Row shape expected by the CSV builder — a `NetworkDevice` with an optional
 * embedded office. Supabase's joined selects return only the columns we
 * asked for (`office:offices(id, name)`), so we widen the `office` field on
 * `NetworkDevice` (which expects the full `Office`) to a partial with just
 * the name available.
 */
export type NetworkDeviceExportRow = Omit<NetworkDevice, 'office'> & {
  office?: Pick<Office, 'name'> | null
}

interface CsvColumn {
  header: string
  value: (row: NetworkDeviceExportRow) => unknown
}

// Column order matches the original Phase 18 spec so a spreadsheet handed to
// leadership / an auditor is stable across exports.
const COLUMNS: CsvColumn[] = [
  { header: 'Office', value: (r) => r.office?.name ?? '' },
  { header: 'Name', value: (r) => r.name },
  { header: 'Type', value: (r) => r.device_type },
  { header: 'Manufacturer', value: (r) => r.manufacturer },
  { header: 'Model', value: (r) => r.model },
  { header: 'Serial', value: (r) => r.serial_number },
  { header: 'Firmware', value: (r) => r.firmware_version },
  { header: 'Mgmt IP', value: (r) => r.management_ip },
  { header: 'Mgmt URL', value: (r) => r.management_url },
  { header: 'MAC', value: (r) => r.mac_address },
  { header: 'Status', value: (r) => r.status },
  { header: 'Last Seen', value: (r) => r.last_seen },
  { header: 'Source', value: (r) => r.source },
  { header: 'Vault Ref', value: (r) => r.credentials_vault_ref },
  { header: 'Notes', value: (r) => r.notes },
]

/**
 * Render a single value into a CSV field per RFC 4180. Null/undefined become
 * empty strings; anything containing a comma, quote, CR, or LF is wrapped in
 * quotes with embedded quotes doubled.
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'string' ? value : String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Serialize network devices to a CSV string. Uses CRLF line endings for
 * maximum Excel/Sheets compatibility; a UTF-8 BOM is prepended so Excel
 * treats non-ASCII characters (e.g. accented office names) correctly.
 */
export function buildDevicesCsv(devices: NetworkDeviceExportRow[]): string {
  const lines: string[] = []
  lines.push(COLUMNS.map((c) => escapeCsvField(c.header)).join(','))
  for (const device of devices) {
    lines.push(COLUMNS.map((c) => escapeCsvField(c.value(device))).join(','))
  }
  // \uFEFF = UTF-8 BOM. Excel needs it to auto-detect UTF-8 on double-click.
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

/**
 * Build a filesystem-safe slug for use in a download filename.
 * "Charlotte Office" → "charlotte-office".
 */
export function slugForFilename(input: string | null | undefined): string {
  const s = String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'export'
}

/**
 * Compact date stamp (YYYYMMDD) in UTC — matches the phase spec.
 */
export function todayStamp(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

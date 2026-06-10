/**
 * Network device import helpers (CSV + XLSX → validated rows → bulk insert).
 *
 * Used by the `/network/import` wizard and `/api/network/devices/import` route.
 * Kept framework-agnostic so it can be unit-tested without a Supabase client
 * (`commitRows` is the only function that touches the DB).
 *
 * Column mapping is driven by the wizard: the caller passes a
 * `{ targetField -> sourceHeader }` map so the operator can match arbitrary
 * spreadsheet column names to our `network_devices` fields.
 */

import ExcelJS from 'exceljs'
import { getServiceSupabase } from './supabase'
import type {
  NetworkDeviceSource,
  NetworkDeviceStatus,
  NetworkDeviceType,
  Office,
} from './types'
import {
  IMPORT_TARGET_FIELDS,
  REQUIRED_TARGET_FIELDS,
  VALID_DEVICE_TYPES,
  VALID_STATUSES,
  autoMapHeaders,
  type ImportColumnMap,
  type ImportError,
  type ImportTargetField,
} from './network-import-shared'

export {
  IMPORT_TARGET_FIELDS,
  REQUIRED_TARGET_FIELDS,
  VALID_DEVICE_TYPES,
  VALID_STATUSES,
  autoMapHeaders,
}
export type { ImportColumnMap, ImportError, ImportTargetField }

export interface ParsedFile {
  headers: string[]
  rows: Record<string, string>[]
}

export interface NetworkDeviceImportInput {
  office_id: string | null
  name: string
  device_type: NetworkDeviceType
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  firmware_version: string | null
  management_ip: string | null
  management_url: string | null
  mac_address: string | null
  status: NetworkDeviceStatus
  credentials_vault_ref: string | null
  notes: string | null
  source: NetworkDeviceSource
}

export interface RowResult {
  rowNumber: number
  raw: Record<string, string>
  valid: boolean
  errors: ImportError[]
  parsed: NetworkDeviceImportInput | null
}

export interface ValidationOutcome {
  valid: NetworkDeviceImportInput[]
  errors: ImportError[]
  rowResults: RowResult[]
}

export interface ValidateRowsOptions {
  rows: Record<string, string>[]
  columnMap: ImportColumnMap
  offices: Pick<Office, 'id' | 'name'>[]
  defaultSource?: NetworkDeviceSource
}

// ─── Parsing ────────────────────────────────────────────────────────────────

export async function parseFile(
  buffer: Buffer,
  filename: string
): Promise<ParsedFile> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) return parseCSVBuffer(buffer)
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseXLSXBuffer(buffer)
  }
  throw new Error(
    `Unsupported file type "${filename}". Upload a .csv or .xlsx file.`
  )
}

function parseCSVBuffer(buffer: Buffer): ParsedFile {
  const text = buffer.toString('utf-8').replace(/^\uFEFF/, '')
  const matrix = parseCSV(text)
  return matrixToParsed(matrix)
}

async function parseXLSXBuffer(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const matrix: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const arr: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (arr.length < colNumber - 1) arr.push('')
      arr.push(cellValueToString(cell.value))
    })
    matrix.push(arr)
  })
  return matrixToParsed(matrix)
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value && value.result != null) return String(value.result)
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('')
    }
    if ('hyperlink' in value && 'text' in value && typeof value.text === 'string') {
      return value.text
    }
  }
  return String(value)
}

function matrixToParsed(matrix: string[][]): ParsedFile {
  if (matrix.length === 0) return { headers: [], rows: [] }
  const headers = matrix[0].map((h) => (h ?? '').trim())
  const rows = matrix.slice(1).map((rowArr) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (!h) return
      obj[h] = ((rowArr[i] ?? '') as string).trim()
    })
    return obj
  })
  return { headers, rows }
}

/**
 * RFC 4180-ish CSV parser. Handles:
 *   - Quoted fields containing commas, newlines, and escaped quotes ("")
 *   - CRLF and LF line endings
 *   - Trailing whitespace and BOM (BOM stripped by the caller)
 * Skips fully-empty rows (all cells blank).
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += c
      i++
      continue
    }

    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(cell)
      cell = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
      i++
      continue
    }
    cell += c
    i++
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    if (row.some((v) => v !== '')) rows.push(row)
  }

  return rows
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateRows({
  rows,
  columnMap,
  offices,
  defaultSource = 'csv',
}: ValidateRowsOptions): ValidationOutcome {
  const officeMap = new Map<string, string>(
    offices.map((o) => [o.name.trim().toLowerCase(), o.id])
  )

  const valid: NetworkDeviceImportInput[] = []
  const errors: ImportError[] = []
  const rowResults: RowResult[] = []

  rows.forEach((rawRow, idx) => {
    const rowNumber = idx + 1
    const rowErrors: ImportError[] = []

    const get = (target: ImportTargetField): string => {
      const sourceCol = columnMap[target]
      if (!sourceCol) return ''
      return (rawRow[sourceCol] ?? '').trim()
    }

    const officeName = get('office_name')
    const name = get('name')
    const deviceType = get('device_type').toLowerCase()
    const statusRaw = get('status').toLowerCase()
    const status = (statusRaw || 'unknown') as NetworkDeviceStatus

    let office_id: string | null = null
    if (!officeName) {
      rowErrors.push({
        row: rowNumber,
        field: 'office_name',
        message: 'office_name is required',
      })
    } else {
      office_id = officeMap.get(officeName.toLowerCase()) ?? null
      if (!office_id) {
        rowErrors.push({
          row: rowNumber,
          field: 'office_name',
          message: `Office "${officeName}" not found. Add it under /settings/offices first.`,
        })
      }
    }

    if (!name) {
      rowErrors.push({
        row: rowNumber,
        field: 'name',
        message: 'name is required',
      })
    }

    if (!deviceType) {
      rowErrors.push({
        row: rowNumber,
        field: 'device_type',
        message: 'device_type is required',
      })
    } else if (
      !VALID_DEVICE_TYPES.includes(deviceType as NetworkDeviceType)
    ) {
      rowErrors.push({
        row: rowNumber,
        field: 'device_type',
        message: `device_type must be one of: ${VALID_DEVICE_TYPES.join(', ')}`,
      })
    }

    if (statusRaw && !VALID_STATUSES.includes(status)) {
      rowErrors.push({
        row: rowNumber,
        field: 'status',
        message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
      })
    }

    const isValid = rowErrors.length === 0
    let parsed: NetworkDeviceImportInput | null = null

    if (isValid) {
      parsed = {
        office_id,
        name,
        device_type: deviceType as NetworkDeviceType,
        manufacturer: get('manufacturer') || null,
        model: get('model') || null,
        serial_number: get('serial_number') || null,
        firmware_version: get('firmware_version') || null,
        management_ip: get('management_ip') || null,
        management_url: get('management_url') || null,
        mac_address: get('mac_address') || null,
        status,
        credentials_vault_ref: get('credentials_vault_ref') || null,
        notes: get('notes') || null,
        source: defaultSource,
      }
      valid.push(parsed)
    }

    errors.push(...rowErrors)
    rowResults.push({
      rowNumber,
      raw: rawRow,
      valid: isValid,
      errors: rowErrors,
      parsed,
    })
  })

  return { valid, errors, rowResults }
}

// ─── Commit ─────────────────────────────────────────────────────────────────

export async function commitRows(
  devices: NetworkDeviceImportInput[]
): Promise<{ inserted: number }> {
  if (devices.length === 0) return { inserted: 0 }
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('network_devices')
    .insert(devices)
    .select('id')
  if (error) throw error
  return { inserted: data?.length ?? 0 }
}


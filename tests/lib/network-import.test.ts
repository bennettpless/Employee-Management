import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'

// network-import.ts re-exports commitRows, which pulls in the service-role
// Supabase client at module scope — mock it so importing the lib doesn't
// require env vars. None of these tests touch the DB.
vi.mock('@/lib/supabase', () => ({
  getServiceSupabase: () => {
    throw new Error('DB should not be touched by parsing/validation tests')
  },
}))

import {
  parseFile,
  validateRows,
  autoMapHeaders,
  VALID_DEVICE_TYPES,
  VALID_STATUSES,
  type ImportColumnMap,
} from '@/lib/network-import'

const OFFICES = [
  { id: 'office-atl', name: 'Atlanta' },
  { id: 'office-clt', name: 'Charlotte Office' },
]

/** Identity column map for rows keyed by our canonical field names. */
const IDENTITY_MAP: ImportColumnMap = {
  office_name: 'office_name',
  name: 'name',
  device_type: 'device_type',
  manufacturer: 'manufacturer',
  model: 'model',
  serial_number: 'serial_number',
  firmware_version: 'firmware_version',
  management_ip: 'management_ip',
  management_url: 'management_url',
  mac_address: 'mac_address',
  status: 'status',
  credentials_vault_ref: 'credentials_vault_ref',
  notes: 'notes',
}

function csvBuffer(text: string): Buffer {
  return Buffer.from(text, 'utf-8')
}

describe('parseFile — CSV', () => {
  it('parses a simple CSV with headers', async () => {
    const { headers, rows } = await parseFile(
      csvBuffer('name,device_type\nSwitch-01,switch\nAP-Lobby,access_point\n'),
      'devices.csv'
    )
    expect(headers).toEqual(['name', 'device_type'])
    expect(rows).toEqual([
      { name: 'Switch-01', device_type: 'switch' },
      { name: 'AP-Lobby', device_type: 'access_point' },
    ])
  })

  it('handles quoted fields with commas, escaped quotes, and CRLF endings', async () => {
    const { rows } = await parseFile(
      csvBuffer('name,notes\r\n"Core, Switch","He said ""hi"""\r\n'),
      'devices.csv'
    )
    expect(rows).toEqual([{ name: 'Core, Switch', notes: 'He said "hi"' }])
  })

  it('strips a UTF-8 BOM and trims whitespace', async () => {
    const { headers, rows } = await parseFile(
      csvBuffer('\uFEFFname , device_type \n  fw-1  ,  firewall \n'),
      'devices.csv'
    )
    expect(headers).toEqual(['name', 'device_type'])
    expect(rows).toEqual([{ name: 'fw-1', device_type: 'firewall' }])
  })

  it('skips fully-empty rows', async () => {
    const { rows } = await parseFile(
      csvBuffer('name,device_type\n,\nSwitch-01,switch\n\n'),
      'devices.csv'
    )
    expect(rows).toHaveLength(1)
  })

  it('rejects unsupported file types', async () => {
    await expect(parseFile(csvBuffer('x'), 'devices.pdf')).rejects.toThrow(
      /Unsupported file type/
    )
  })
})

describe('parseFile — XLSX', () => {
  it('parses a workbook built in memory', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Devices')
    sheet.addRow(['name', 'device_type', 'management_ip'])
    sheet.addRow(['Switch-01', 'switch', '10.0.0.2'])
    sheet.addRow(['AP-Lobby', 'access_point', ''])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const { headers, rows } = await parseFile(buffer, 'devices.xlsx')
    expect(headers).toEqual(['name', 'device_type', 'management_ip'])
    expect(rows).toEqual([
      { name: 'Switch-01', device_type: 'switch', management_ip: '10.0.0.2' },
      { name: 'AP-Lobby', device_type: 'access_point', management_ip: '' },
    ])
  })
})

describe('autoMapHeaders', () => {
  it('maps exact canonical names', () => {
    const map = autoMapHeaders(['office_name', 'name', 'device_type'])
    expect(map.office_name).toBe('office_name')
    expect(map.name).toBe('name')
    expect(map.device_type).toBe('device_type')
  })

  it('maps common aliases regardless of case and separators', () => {
    const map = autoMapHeaders([
      'Site',
      'Device Name',
      'Type',
      'Vendor',
      'IP Address',
      'MAC',
      'State',
      'Comments',
    ])
    expect(map.office_name).toBe('Site')
    expect(map.name).toBe('Device Name')
    expect(map.device_type).toBe('Type')
    expect(map.manufacturer).toBe('Vendor')
    expect(map.management_ip).toBe('IP Address')
    expect(map.mac_address).toBe('MAC')
    expect(map.status).toBe('State')
    expect(map.notes).toBe('Comments')
  })

  it('leaves unmatched targets unmapped', () => {
    const map = autoMapHeaders(['name', 'some_random_column'])
    expect(map.name).toBe('name')
    expect(map.serial_number).toBeUndefined()
  })
})

describe('validateRows', () => {
  const validRow = {
    office_name: 'Atlanta',
    name: 'Switch-01',
    device_type: 'switch',
    status: 'online',
  }

  it('accepts a valid row and resolves the office id', () => {
    const { valid, errors, rowResults } = validateRows({
      rows: [validRow],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(errors).toHaveLength(0)
    expect(rowResults[0].valid).toBe(true)
    expect(valid[0]).toMatchObject({
      office_id: 'office-atl',
      name: 'Switch-01',
      device_type: 'switch',
      status: 'online',
      source: 'csv',
    })
  })

  it('matches office names case-insensitively', () => {
    const { valid } = validateRows({
      rows: [{ ...validRow, office_name: 'charlotte office' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(valid[0].office_id).toBe('office-clt')
  })

  it('flags missing required fields', () => {
    const { errors, rowResults } = validateRows({
      rows: [{ office_name: '', name: '', device_type: '' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(rowResults[0].valid).toBe(false)
    const fields = errors.map((e) => e.field).sort()
    expect(fields).toEqual(['device_type', 'name', 'office_name'])
  })

  it('flags an unknown office', () => {
    const { errors } = validateRows({
      rows: [{ ...validRow, office_name: 'Nashville' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('office_name')
    expect(errors[0].message).toContain('Nashville')
  })

  it('flags an invalid device_type and lists the valid options', () => {
    const { errors } = validateRows({
      rows: [{ ...validRow, device_type: 'toaster' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('device_type')
    for (const t of VALID_DEVICE_TYPES) {
      expect(errors[0].message).toContain(t)
    }
  })

  it('lowercases enum values before validating', () => {
    const { valid, errors } = validateRows({
      rows: [{ ...validRow, device_type: 'SWITCH', status: 'ONLINE' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(errors).toHaveLength(0)
    expect(valid[0].device_type).toBe('switch')
    expect(valid[0].status).toBe('online')
  })

  it('flags an invalid status but defaults a blank one to "unknown"', () => {
    const bad = validateRows({
      rows: [{ ...validRow, status: 'exploded' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(bad.errors).toHaveLength(1)
    expect(bad.errors[0].field).toBe('status')
    expect(VALID_STATUSES).not.toContain('exploded')

    const blank = validateRows({
      rows: [{ ...validRow, status: '' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(blank.errors).toHaveLength(0)
    expect(blank.valid[0].status).toBe('unknown')
  })

  it('applies the column map so arbitrary spreadsheet headers work', () => {
    const { valid, errors } = validateRows({
      rows: [
        {
          Site: 'Atlanta',
          'Device Name': 'fw-edge',
          Kind: 'firewall',
        },
      ],
      columnMap: {
        office_name: 'Site',
        name: 'Device Name',
        device_type: 'Kind',
      },
      offices: OFFICES,
    })
    expect(errors).toHaveLength(0)
    expect(valid[0]).toMatchObject({
      office_id: 'office-atl',
      name: 'fw-edge',
      device_type: 'firewall',
    })
  })

  it('nulls out blank optional fields and honors defaultSource', () => {
    const { valid } = validateRows({
      rows: [{ ...validRow, manufacturer: '', notes: '' }],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
      defaultSource: 'manual',
    })
    expect(valid[0].manufacturer).toBeNull()
    expect(valid[0].notes).toBeNull()
    expect(valid[0].source).toBe('manual')
  })

  it('keeps row numbering aligned with the input order across mixed rows', () => {
    const { rowResults } = validateRows({
      rows: [validRow, { ...validRow, name: '' }, validRow],
      columnMap: IDENTITY_MAP,
      offices: OFFICES,
    })
    expect(rowResults.map((r) => r.valid)).toEqual([true, false, true])
    expect(rowResults[1].errors[0].row).toBe(2)
  })
})

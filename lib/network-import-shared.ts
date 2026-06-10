/**
 * Client-safe constants and pure helpers for the network device import flow.
 *
 * Kept in its own file so the import wizard (which runs in the browser) can
 * pull these without dragging in the Node-only `exceljs` and Supabase
 * service-role client that live in `network-import.ts`.
 */

import type { NetworkDeviceStatus, NetworkDeviceType } from './types'

export const IMPORT_TARGET_FIELDS = [
  'office_name',
  'name',
  'device_type',
  'manufacturer',
  'model',
  'serial_number',
  'firmware_version',
  'management_ip',
  'management_url',
  'mac_address',
  'status',
  'credentials_vault_ref',
  'notes',
] as const

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number]

export const REQUIRED_TARGET_FIELDS: readonly ImportTargetField[] = [
  'office_name',
  'name',
  'device_type',
] as const

export const VALID_DEVICE_TYPES: readonly NetworkDeviceType[] = [
  'access_point',
  'switch',
  'firewall',
  'server',
  'router',
  'other',
] as const

export const VALID_STATUSES: readonly NetworkDeviceStatus[] = [
  'online',
  'offline',
  'warning',
  'critical',
  'unknown',
] as const

export type ImportColumnMap = Partial<
  Record<ImportTargetField, string | null>
>

export interface ImportError {
  row: number
  field: string
  message: string
}

export const TARGET_FIELD_LABEL: Record<ImportTargetField, string> = {
  office_name: 'Office name',
  name: 'Device name',
  device_type: 'Device type',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serial_number: 'Serial number',
  firmware_version: 'Firmware version',
  management_ip: 'Management IP',
  management_url: 'Management URL',
  mac_address: 'MAC address',
  status: 'Status',
  credentials_vault_ref: 'Credentials vault ref',
  notes: 'Notes',
}

/**
 * Best-effort guess at a column map from a list of file headers. The wizard
 * uses this to pre-populate the mapping step so the operator only edits the
 * mismatches.
 */
export function autoMapHeaders(headers: string[]): ImportColumnMap {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const lookup = new Map<string, string>()
  for (const h of headers) lookup.set(norm(h), h)

  const synonyms: Record<ImportTargetField, string[]> = {
    office_name: ['office_name', 'office', 'location', 'site'],
    name: ['name', 'device_name', 'hostname', 'host'],
    device_type: ['device_type', 'type', 'category'],
    manufacturer: ['manufacturer', 'vendor', 'make'],
    model: ['model'],
    serial_number: ['serial_number', 'serial', 'sn'],
    firmware_version: ['firmware_version', 'firmware', 'fw'],
    management_ip: [
      'management_ip',
      'mgmt_ip',
      'ip',
      'ip_address',
      'address',
    ],
    management_url: ['management_url', 'mgmt_url', 'url', 'admin_url'],
    mac_address: ['mac_address', 'mac'],
    status: ['status', 'state'],
    credentials_vault_ref: [
      'credentials_vault_ref',
      'credentials',
      'vault_ref',
      'vault',
      'lastpass',
    ],
    notes: ['notes', 'description', 'comment', 'comments'],
  }

  const map: ImportColumnMap = {}
  for (const target of IMPORT_TARGET_FIELDS) {
    for (const candidate of synonyms[target]) {
      const hit = lookup.get(candidate)
      if (hit) {
        map[target] = hit
        break
      }
    }
  }
  return map
}

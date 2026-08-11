import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readWorkbookSheet, workbookRefFromEnv, excelValueToIsoDate } from '@/lib/sharepoint-workbook'
import { buildEmployeeMatcher } from '@/lib/devices'
import { currentActor, logAudit } from '@/lib/audit'
import type { AssetType, DeviceStatus } from '@/lib/types'

export const maxDuration = 300

const DEFAULT_WORKBOOK_FILE = 'IT Team All Data.xlsx'
const DEFAULT_SHEET_NAME = 'Device Inventory'

// Exact headers of the "Device Inventory" sheet (probed 2026-07):
// Asset ID | Asset Type | Make / Manufacturer | Model | Serial Number |
// Office / Location | Status | Department | Assigned User | Commission Date |
// Decommission Date | Warranty Period (months) | Warranty End Date |
// Win 11 Compatible | Condition / Issue | Repair / Upgrade History |
// Last Inventoried | Batch Owner
const HEADER_ALIASES: Record<string, string[]> = {
  asset_tag: ['asset id', 'asset tag'],
  asset_type: ['asset type', 'type'],
  manufacturer: ['make / manufacturer', 'make', 'manufacturer'],
  model: ['model'],
  serial_number: ['serial number', 'serial'],
  location: ['office / location', 'location', 'office'],
  status: ['status'],
  department: ['department'],
  assigned_user: ['assigned user', 'user'],
  commissioned_at: ['commission date'],
  decommissioned_at: ['decommission date'],
  warranty_months: ['warranty period (months)', 'warranty period'],
  warranty_end: ['warranty end date', 'warranty end'],
  win11: ['win 11 compatible', 'win11 compatible'],
  condition: ['condition / issue', 'condition'],
  repair_history: ['repair / upgrade history', 'repair history'],
  last_inventoried: ['last inventoried'],
}

function buildHeaderMap(headers: string[]) {
  const map: Record<string, string> = {}
  const unmatchedHeaders: string[] = []
  for (const header of headers) {
    const norm = header.trim().toLowerCase()
    const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(norm))
    if (field) {
      map[field] = header
    } else {
      unmatchedHeaders.push(header)
    }
  }
  return { map, unmatchedHeaders }
}

const isNA = (v: unknown) => {
  const s = String(v ?? '').trim().toLowerCase()
  return !s || s === 'n/a' || s === 'na' || s === 'none' || s === '?' || s === 'unknown'
}

const text = (v: unknown): string | null => (isNA(v) ? null : String(v).trim())

function mapAssetType(raw: unknown): AssetType {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s.includes('laptop')) return 'laptop'
  if (s.includes('desktop') || s.includes('workstation') || s.includes('tower')) return 'desktop'
  if (s.includes('monitor')) return 'monitor'
  if (s === 'tv' || s.includes('tv')) return 'tv'
  if (s.includes('printer')) return 'printer'
  if (s.includes('server')) return 'server'
  return 'other'
}

function mapStatus(raw: unknown): { status: DeviceStatus; note: string | null } {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'in use') return { status: 'active', note: null }
  if (s === 'in stock') return { status: 'in_stock', note: null }
  if (s === 'decommissioned' || s === 'retired') return { status: 'decommissioned', note: null }
  if (s === 'broken' || s === 'repair' || s === 'in repair') return { status: 'repair', note: s === 'broken' ? 'Broken' : null }
  if (!s) return { status: 'in_stock', note: null }
  // Unknown sheet status: keep the device usable, preserve the label
  return { status: 'in_stock', note: `Sheet status: ${String(raw).trim()}` }
}

function parseWarrantyMonths(raw: unknown): number | null {
  if (isNA(raw)) return null
  const match = /(\d+)/.exec(String(raw))
  return match ? parseInt(match[1], 10) : null
}

export async function POST(_request: NextRequest) {
  const supabase = getServiceSupabase()
  const startedAt = new Date()

  const { data: syncLog } = await supabase
    .from('sync_logs')
    .insert({ sync_type: 'device_inventory', status: 'failed', started_at: startedAt.toISOString() })
    .select()
    .single()

  const finishLog = async (fields: Record<string, unknown>) => {
    if (!syncLog) return
    await supabase
      .from('sync_logs')
      .update({
        ...fields,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      })
      .eq('id', syncLog.id)
  }

  try {
    const workbookRef = workbookRefFromEnv('DEVICE_INVENTORY_WORKBOOK', DEFAULT_WORKBOOK_FILE)
    const sheetName = process.env.DEVICE_INVENTORY_SHEET_NAME || DEFAULT_SHEET_NAME

    const { headers, rows } = await readWorkbookSheet(workbookRef, sheetName)
    if (rows.length === 0) {
      throw new Error(`No data rows found in "${sheetName}"`)
    }

    const { map: h, unmatchedHeaders } = buildHeaderMap(headers)
    const requiredFields = ['asset_type', 'serial_number', 'status']
    const missing = requiredFields.filter((f) => !(f in h))
    if (missing.length > 0) {
      throw new Error(`Sheet is missing expected columns: ${missing.join(', ')}. Found headers: ${headers.join(' | ')}`)
    }

    // Employees for assigned-user matching
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, email, display_name, first_name, last_name')
    if (empError) throw empError
    const matchEmployee = buildEmployeeMatcher(employees || [])

    // Build device rows
    const unmatchedUsers = new Set<string>()
    const seenAssetTags = new Set<string>()
    let skipped = 0

    const deviceRows: Array<Record<string, unknown>> = []
    const historyTexts: Array<string | null> = []

    for (const row of rows) {
      const assetTypeRaw = row[h.asset_type]
      const serial = text(row[h.serial_number])
      const model = h.model ? text(row[h.model]) : null
      const manufacturer = h.manufacturer ? text(row[h.manufacturer]) : null

      // Skip rows with no identifying info at all
      if (!serial && !model && !manufacturer && isNA(assetTypeRaw)) {
        skipped++
        historyTexts.push(null)
        continue
      }

      const { status, note: statusNote } = mapStatus(row[h.status])

      let assetTag = h.asset_tag ? text(row[h.asset_tag]) : null
      if (assetTag) {
        // Guard against duplicate asset tags in the sheet (unique index in DB)
        const key = assetTag.toUpperCase()
        if (seenAssetTags.has(key)) {
          assetTag = null
        } else {
          seenAssetTags.add(key)
        }
      }

      const assignedUserRaw = h.assigned_user ? String(row[h.assigned_user] ?? '').trim() : ''
      let employeeId: string | null = null
      let assignedNote: string | null = null
      if (assignedUserRaw && !isNA(assignedUserRaw)) {
        if (assignedUserRaw.toLowerCase() === 'loaner' || assignedUserRaw.toLowerCase() === 'spare') {
          assignedNote = `Designated ${assignedUserRaw.trim().toLowerCase()}`
        } else {
          employeeId = matchEmployee(assignedUserRaw)
          if (!employeeId) unmatchedUsers.add(assignedUserRaw)
        }
      }

      const noteParts: string[] = []
      if (statusNote) noteParts.push(statusNote)
      if (assignedNote) noteParts.push(assignedNote)
      const condition = h.condition ? text(row[h.condition]) : null
      if (condition && condition.toLowerCase() !== 'healthy') noteParts.push(`Condition: ${condition}`)
      const win11 = h.win11 ? text(row[h.win11]) : null
      if (win11) noteParts.push(`Win 11 compatible: ${win11}`)
      if (!employeeId && assignedUserRaw && !isNA(assignedUserRaw) && !assignedNote) {
        noteParts.push(`Assigned user (unmatched): ${assignedUserRaw}`)
      }

      const assetType = mapAssetType(assetTypeRaw)
      const deviceName =
        assetTag ||
        [manufacturer, model].filter(Boolean).join(' ') ||
        serial ||
        'Unnamed device'

      deviceRows.push({
        device_name: deviceName,
        device_type: text(assetTypeRaw) || assetType,
        asset_tag: assetTag,
        asset_type: assetType,
        manufacturer,
        model,
        serial_number: serial,
        location: h.location ? text(row[h.location]) : null,
        department: h.department ? text(row[h.department]) : null,
        status,
        employee_id: employeeId,
        commissioned_at: h.commissioned_at ? excelValueToIsoDate(isNA(row[h.commissioned_at]) ? null : row[h.commissioned_at]) : null,
        decommissioned_at: h.decommissioned_at ? excelValueToIsoDate(isNA(row[h.decommissioned_at]) ? null : row[h.decommissioned_at]) : null,
        warranty_months: h.warranty_months ? parseWarrantyMonths(row[h.warranty_months]) : null,
        warranty_end: h.warranty_end ? excelValueToIsoDate(isNA(row[h.warranty_end]) ? null : row[h.warranty_end]) : null,
        last_seen: h.last_inventoried ? excelValueToIsoDate(isNA(row[h.last_inventoried]) ? null : row[h.last_inventoried]) : null,
        notes: noteParts.length > 0 ? noteParts.join('. ') : null,
        is_in_ninja: false,
        last_synced_at: new Date().toISOString(),
      })
      historyTexts.push(h.repair_history ? text(row[h.repair_history]) : null)
    }

    // Merge into the existing inventory: match by serial number (fallback
    // asset tag), update matched devices, insert new ones. Devices that are
    // not on the sheet (e.g. added from NinjaOne by the onboarding sync) are
    // left untouched — the sheet no longer wipes the database.
    const { data: existingDevices, error: existingError } = await supabase
      .from('devices')
      .select('id, serial_number, asset_tag, employee_id, status, notes')
    if (existingError) throw existingError

    const norm = (s: unknown) => String(s ?? '').trim().toUpperCase()
    const bySerial = new Map<string, any>()
    const byAssetTag = new Map<string, any>()
    // Fallback for rows with no serial/asset tag (some monitors, TVs):
    // name + location, so repeated merges don't duplicate them
    const byNameLocation = new Map<string, any>()
    const { data: existingFull } = await supabase
      .from('devices')
      .select('id, device_name, location')
      .is('serial_number', null)
      .is('asset_tag', null)
    for (const d of existingDevices || []) {
      if (d.serial_number) bySerial.set(norm(d.serial_number), d)
      if (d.asset_tag) byAssetTag.set(norm(d.asset_tag), d)
    }
    for (const d of existingFull || []) {
      byNameLocation.set(`${norm(d.device_name)}|${norm(d.location)}`, d)
    }

    const nowIso = new Date().toISOString()
    let created = 0
    let updatedCount = 0
    let assignmentsChanged = 0
    let historyEntries = 0
    const BATCH = 200

    const toInsert: Array<{ row: Record<string, unknown>; history: string | null }> = []

    for (let i = 0; i < deviceRows.length; i++) {
      const row = deviceRows[i]
      const existing =
        (row.serial_number ? bySerial.get(norm(row.serial_number)) : null) ??
        (row.asset_tag ? byAssetTag.get(norm(row.asset_tag)) : null) ??
        (!row.serial_number && !row.asset_tag
          ? byNameLocation.get(`${norm(row.device_name)}|${norm(row.location)}`)
          : null)

      if (!existing) {
        toInsert.push({ row, history: historyTexts[i] })
        continue
      }

      // Update the matched device. Keep existing notes if the sheet adds none.
      const updateData: Record<string, unknown> = { ...row }
      if (!updateData.notes) delete updateData.notes
      const { error: updError } = await supabase
        .from('devices')
        .update(updateData)
        .eq('id', existing.id)
      if (updError) {
        unmatchedUsers.add(`Update failed for ${row.device_name}: ${updError.message}`)
        continue
      }
      updatedCount++

      // Assignment changed → close old history entry, open a new one
      if (row.employee_id !== existing.employee_id) {
        assignmentsChanged++
        if (existing.employee_id) {
          await supabase
            .from('device_assignments_history')
            .update({ is_current: false, unassignment_date: nowIso })
            .eq('device_id', existing.id)
            .eq('is_current', true)
        }
        if (row.employee_id) {
          await supabase.from('device_assignments_history').insert({
            device_id: existing.id,
            employee_id: row.employee_id,
            assignment_date: nowIso,
            is_current: true,
          })
        }
      }
    }

    // Insert brand-new devices in batches; keep ids aligned for history rows
    const insertedIds: string[] = []
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { data: inserted, error: insertError } = await supabase
        .from('devices')
        .insert(batch.map((x) => x.row))
        .select('id')
      if (insertError) throw insertError
      insertedIds.push(...(inserted || []).map((d: any) => d.id))
    }
    created = insertedIds.length

    // Assignment + sheet history rows for the new devices only
    const assignmentRows = toInsert
      .map((x, i) => ({ d: x.row, id: insertedIds[i] }))
      .filter(({ d, id }) => id && d.employee_id)
      .map(({ d, id }) => ({
        device_id: id,
        employee_id: d.employee_id,
        assignment_date: nowIso,
        is_current: true,
      }))
    for (let i = 0; i < assignmentRows.length; i += BATCH) {
      await supabase.from('device_assignments_history').insert(assignmentRows.slice(i, i + BATCH))
    }

    const historyRows = toInsert
      .map((x, i) => ({ t: x.history, id: insertedIds[i] }))
      .filter(({ t, id }) => t && id)
      .map(({ t, id }) => ({
        device_id: id,
        event_type: 'note',
        event_date: new Date().toISOString().slice(0, 10),
        description: `Imported from inventory sheet: ${t}`,
      }))
    for (let i = 0; i < historyRows.length; i += BATCH) {
      await supabase.from('device_history').insert(historyRows.slice(i, i + BATCH))
    }
    historyEntries = historyRows.length

    await finishLog({ status: 'success', records_synced: created + updatedCount, records_failed: skipped })

    await logAudit({
      actor: await currentActor(),
      action: 'sync.inventory_import',
      entity_type: 'sync',
      entity_label: 'Device Inventory import (merge)',
      details: { created, updated: updatedCount, assignmentsChanged, skipped },
    })

    return NextResponse.json({
      success: true,
      stats: {
        sheetRows: rows.length,
        created,
        updated: updatedCount,
        assignmentsChanged,
        skipped,
        newAssigned: assignmentRows.length,
        unmatchedUsers: unmatchedUsers.size,
        historyEntries,
      },
      unmatchedUsers: Array.from(unmatchedUsers).slice(0, 100),
      unmatchedHeaders,
      duration: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    })
  } catch (error: any) {
    console.error('Device inventory import error:', error)
    await finishLog({ status: 'failed', error_message: error.message })
    return NextResponse.json(
      { error: error.message || 'Failed to import device inventory' },
      { status: 500 }
    )
  }
}

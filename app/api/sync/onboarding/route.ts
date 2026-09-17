import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { readWorkbookSheetRaw, workbookRefFromEnv, excelValueToIsoDate } from '@/lib/sharepoint-workbook'
import { buildEmployeeMatcher, closeCurrentAssignments, departmentForEmployee, insertAssignmentHistory, officeNameToLocation } from '@/lib/devices'
import { ninjaOne } from '@/lib/ninjaone'
import { currentActor, logAudit } from '@/lib/audit'
import type { SyncReviewItem } from '@/lib/sync-review'
import {
  chassisToAssetType,
  ninjaInsertRow,
  ninjaSerialKey,
  normalizeSerial,
} from '@/lib/ninja-inventory'
import { applyLoanerOnAssign, applyLoanerOnReturn } from '@/lib/loaner-checkout'
import { removeEmployeeFromProgram } from '@/lib/offboard'
import { maybeConsumeStockLot, fetchLotsWithMetrics, promptFromResolution, promptForDevice } from '@/lib/stock-consume'
import { resolveStockLot, chargeOfficeOptions } from '@/lib/stock-tracker'
import { listAzureDirectoryUsers } from '@/lib/azure-graph'
import { azureUserEmailKey, diffAzureEmployee } from '@/lib/azure-employee-sync'

export const maxDuration = 300

const DEFAULT_WORKBOOK_FILE = 'Onboarding.xlsx'
const ONBOARDING_SHEET = process.env.ONBOARDING_SHEET_NAME || 'Onboarding'
const OFFBOARDING_SHEET = process.env.OFFBOARDING_SHEET_NAME || 'Offboarding'

// Safety cap so a malformed sheet can never trigger a full-history rescan.
const MAX_BATCH = 25
// Stop scanning once this many consecutive entries are already handled.
// (A single known name isn't enough — an unfinished column or a re-listed
// employee shouldn't hide newer hires sitting behind it.)
const STOP_AFTER_KNOWN = 3

/**
 * Both sheets are transposed: column A holds field labels, and each
 * subsequent column is one employee (probed 2026-07).
 *
 * New entries are inserted at the LEFT of each sheet (column B), so the
 * newest entry is the first data column and the oldest is at the far right.
 *
 * This sync only processes the newest entries: it walks columns
 * left-to-right and stops once it has seen several consecutive names that
 * are already in the system — everything past that was handled by a
 * previous sync. (The Device Inventory Excel sheet was a one-time seed of
 * the database and is not consulted going forward.)
 *
 * Onboarding labels used: Name, Username, Email, Employee Title,
 * Phone number, ext, Location, "Determine if using existing or new machine".
 * That machine cell reads like "New BPL-5XBKPK4" or "Existing ATL-1C7XY84":
 *   - Both modes → find by device_name in inventory and assign; if missing,
 *     look up NinjaOne (systemName/dnsName), create + assign. If it still
 *     isn't in NinjaOne, park it in pending_device_lookups and retry next sync.
 *   - Only brand-new hires (not already in the DB) are read from the sheet.
 *     Older columns are skipped after a short streak of known names — we do
 *     not re-walk months of history to assign machines (those users may
 *     already have devices from inventory that aren't on the sheet).
 * Offboarding labels used: Employee Name, Termination date.
 */
function findRow(grid: any[][], label: string): any[] | null {
  const norm = label.trim().toLowerCase()
  for (const row of grid) {
    if (String(row?.[0] ?? '').trim().toLowerCase() === norm) return row
  }
  return null
}

function cellText(row: any[] | null, col: number): string | null {
  if (!row) return null
  const v = String(row[col] ?? '').trim()
  return v.length > 0 ? v : null
}

function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 0) return { first: null, last: null }
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/**
 * Parse the "Determine if using existing or new machine" cell.
 * Mode comes from the New/Existing keyword; the machine name is a
 * PC-name token, e.g. "New BPL- 5XBKPK4" → BPL-5XBKPK4.
 * Sheet → inventory / Ninja matching uses device name (systemName), not serial.
 * For "BPL-5XBKPK4" we also try the suffix "5XBKPK4" in case the name is stored bare.
 */
function parseMachineCell(raw: string | null): { mode: 'new' | 'existing' | null; pcName: string | null; tokens: string[] } {
  if (!raw) return { mode: null, pcName: null, tokens: [] }

  let mode: 'new' | 'existing' | null = null
  if (/\bnew\b/i.test(raw)) mode = 'new'
  else if (/\bexisting\b/i.test(raw)) mode = 'existing'

  const cleaned = raw.replace(/\s*-\s*/g, '-')
  const parts = cleaned.split(/[\s,;/]+/)
  for (const part of parts.reverse()) {
    const t = part.trim()
    if (/^[A-Za-z]{2,6}-[A-Za-z0-9]{4,}$/.test(t)) {
      const suffix = t.slice(t.indexOf('-') + 1)
      return { mode, pcName: t, tokens: /\d/.test(suffix) ? [t, suffix] : [t] }
    }
    if (/^[A-Za-z0-9]{5,}$/.test(t) && /\d/.test(t) && !/^(existing|new)$/i.test(t)) {
      return { mode, pcName: t, tokens: [t] }
    }
  }
  return { mode, pcName: null, tokens: [] }
}

function deviceReviewFields(device: {
  asset_type?: string | null
  status?: string | null
  department?: string | null
  location?: string | null
  serial_number?: string | null
  manufacturer?: string | null
  model?: string | null
  device_name?: string | null
  is_loaner?: boolean | null
  not_from_stock?: boolean | null
}) {
  return {
    asset_type: device.asset_type ?? null,
    status: device.status ?? null,
    department: device.department ?? null,
    location: device.location ?? null,
    serial_number: device.serial_number ?? null,
    manufacturer: device.manufacturer ?? null,
    model: device.model ?? null,
    is_loaner: Boolean(device.is_loaner),
    not_from_stock: Boolean(device.not_from_stock),
    label: device.device_name || device.serial_number || 'Device',
  }
}

export async function POST(_request: NextRequest) {
  const supabase = getServiceSupabase()
  const startedAt = new Date()

  const { data: syncLog } = await supabase
    .from('sync_logs')
    .insert({ sync_type: 'onboarding', status: 'failed', started_at: startedAt.toISOString() })
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
    const workbookRef = workbookRefFromEnv('ONBOARDING_WORKBOOK', DEFAULT_WORKBOOK_FILE)
    const actor = await currentActor()

    const errors: string[] = []
    const review: SyncReviewItem[] = []
    let onboarded = 0
    let updated = 0
    let devicesAssigned = 0
    let devicesCreated = 0
    let devicesPending = 0
    let offboarded = 0
    let devicesReturned = 0
    let ninjaNew = 0
    let azureUpdated = 0
    const processed: { onboarding: string[]; offboarding: string[] } = {
      onboarding: [],
      offboarding: [],
    }

    // One snapshot of employees for "already added" detection and name matching
    let allEmployees: any[] | null = null
    {
      const withAck = await supabase
        .from('employees')
        .select(
          'id, email, display_name, first_name, last_name, employment_status, job_title, office_location, department, azure_job_title_acked, azure_office_acked, azure_department_acked'
        )
      if (withAck.error && /azure_job_title_acked/.test(withAck.error.message || '')) {
        const retry = await supabase
          .from('employees')
          .select(
            'id, email, display_name, first_name, last_name, employment_status, job_title, office_location, department'
          )
        if (retry.error) throw retry.error
        allEmployees = retry.data
      } else if (withAck.error) {
        throw withAck.error
      } else {
        allEmployees = withAck.data
      }
    }
    const matchEmployee = buildEmployeeMatcher(allEmployees || [])
    const employeeById = new Map((allEmployees || []).map((e: any) => [e.id, e]))
    const knownEmails = new Set(
      (allEmployees || []).map((e: any) => String(e.email || '').toLowerCase()).filter(Boolean)
    )
    const employeeByEmail = new Map<string, string>(
      (allEmployees || [])
        .filter((e: any) => e.email)
        .map((e: any) => [String(e.email).toLowerCase(), e.id as string])
    )

    // ── NinjaOne lookups (device list fetched at most once per sync) ──────
    let ninjaDevices: any[] | null = null
    /** Strip separators so "BPL-5XBKPK4" matches "BPL5XBKPK4" / FQDNs. */
    const compactName = (s: unknown) =>
      String(s ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

    const findInNinja = async (tokens: string[]): Promise<any | null> => {
      if (!ninjaDevices) ninjaDevices = await ninjaOne.getDevices()
      const list = ninjaDevices || []

      const scoreHit = (d: any, tokenCompact: string, tokenRaw: string): number => {
        const system = String(d.systemName ?? '')
        const dns = String(d.dnsName ?? '')
        const systemC = compactName(system)
        const dnsC = compactName(dns)
        const raw = tokenRaw.toLowerCase()
        if (!tokenCompact) return 0
        if (systemC === tokenCompact || dnsC === tokenCompact) return 100
        if (systemC.endsWith(tokenCompact) || dnsC.endsWith(tokenCompact)) return 80
        if (systemC.includes(tokenCompact) || dnsC.includes(tokenCompact)) return 60
        // Loose fallback for hyphenated names before compacting
        if (
          system.toLowerCase().includes(raw) ||
          dns.toLowerCase().includes(raw)
        ) {
          return 40
        }
        return 0
      }

      let best: { device: any; score: number } | null = null
      for (const token of tokens) {
        const raw = String(token || '').trim()
        if (!raw) continue
        const tokenCompact = compactName(raw)
        // Avoid ultra-short tokens matching half the fleet
        if (tokenCompact.length < 4) continue
        for (const d of list) {
          const score = scoreHit(d, tokenCompact, raw)
          if (score > 0 && (!best || score > best.score)) {
            best = { device: d, score }
          }
        }
        if (best && best.score >= 80) break
      }
      if (!best) return null
      const details = await ninjaOne.getDevice(String(best.device.id))
      return { ...best.device, ...details }
    }

    /** Create an inventory record from NinjaOne details and assign it. */
    const createDeviceFromNinja = async (
      ninja: any,
      pcName: string,
      employeeId: string,
      employeeName: string,
      location: string | null,
      department: string | null
    ): Promise<{
      id: string
      device_name: string | null
      asset_type: string | null
      status: string | null
      department: string | null
      location: string | null
      serial_number: string | null
      manufacturer: string | null
      model: string | null
    } | null> => {
      let lastSeen: string | null = null
      if (ninja.lastContact) {
        const ts = parseFloat(ninja.lastContact)
        if (Number.isFinite(ts)) lastSeen = new Date(ts * 1000).toISOString()
      }
      const assetType = chassisToAssetType(ninja.nodeClass, ninja.system?.chassisType)
      const manufacturer = ninja.system?.manufacturer || null
      const model = ninja.system?.model || null
      const serialNumber = ninja.system?.serialNumber || ninja.system?.biosSerialNumber || null
      const deviceName = ninja.systemName || pcName
      const { data: createdDevice, error: devError } = await supabase
        .from('devices')
        .insert({
          device_name: deviceName,
          ninja_device_id: String(ninja.id),
          is_in_ninja: true,
          device_type: ninja.nodeClass || null,
          asset_type: assetType,
          manufacturer,
          model,
          serial_number: serialNumber,
          os_name: ninja.os?.name || null,
          os_version: ninja.os?.version || null,
          last_seen: lastSeen,
          employee_id: employeeId,
          status: 'active',
          location,
          department,
          commissioned_at: new Date().toISOString().slice(0, 10),
          notes: `Added by onboarding sync for ${employeeName} (details from NinjaOne)`,
          last_synced_at: new Date().toISOString(),
        })
        .select('id, device_name, asset_type, status, department, location, serial_number, manufacturer, model, is_loaner')
        .single()
      if (devError || !createdDevice) {
        errors.push(`Onboarding: failed to add machine "${pcName}" from NinjaOne: ${devError?.message}`)
        return null
      }
      await insertAssignmentHistory(supabase, {
        deviceId: createdDevice.id,
        employeeId,
      })
      await logAudit({
        actor,
        action: 'device.create',
        entity_type: 'device',
        entity_id: createdDevice.id,
        entity_label: deviceName,
        details: {
          source: 'ninjaone',
          via: 'onboarding-sync',
          assigned_to: employeeName,
          manufacturer,
          model,
          serial_number: serialNumber,
        },
      })
      return createdDevice
    }

    // Assigned-device counts — used to catch up known hires missing a machine
    const { data: assignedDeviceRows } = await supabase
      .from('devices')
      .select('employee_id')
      .not('employee_id', 'is', null)
    const deviceCountByEmp = new Map<string, number>()
    for (const row of assignedDeviceRows || []) {
      if (!row.employee_id) continue
      deviceCountByEmp.set(
        row.employee_id,
        (deviceCountByEmp.get(row.employee_id) || 0) + 1
      )
    }

    /** Find a machine already in inventory by device_name (onboarding sheet match key). */
    const findInInventory = async (tokens: string[], employeeId: string): Promise<any | null> => {
      for (const token of tokens) {
        const t = String(token || '').trim()
        if (!t) continue
        const { data: matches } = await supabase
          .from('devices')
          .select(
            'id, employee_id, device_name, serial_number, asset_tag, asset_type, status, department, location, manufacturer, model, ninja_device_id, is_loaner'
          )
          .ilike('device_name', `%${t}%`)
          .limit(5)
        const device = (matches || []).find((d: any) => !d.employee_id || d.employee_id === employeeId)
          ?? (matches || [])[0]
          ?? null
        if (device) return device
      }
      return null
    }

    /**
     * Inventory first, then NinjaOne (create or link), then pending queue.
     * Used for both "New" and "Existing" sheet modes — Existing used to skip
     * Ninja, which left hires unassigned when the PC was only in NinjaOne.
     */
    const resolveAndAssignMachine = async (opts: {
      machine: { mode: 'new' | 'existing' | null; pcName: string | null; tokens: string[] }
      employeeId: string
      employeeName: string
      email: string | null
      jobTitle: string | null
      location: string | null
    }) => {
      const { machine, employeeId, employeeName, email, jobTitle, location } = opts
      if (machine.mode && !machine.pcName) {
        errors.push(
          `Onboarding: machine is marked "${machine.mode}" for ${employeeName} but no device name is on the sheet yet — no device assigned`
        )
        return
      }
      if (!machine.pcName) return

      let device = await findInInventory(machine.tokens, employeeId)

      if (!device) {
        let ninja: any = null
        let ninjaFailed = false
        try {
          ninja = await findInNinja(machine.tokens)
        } catch (ninjaError: any) {
          ninjaFailed = true
          errors.push(
            `NinjaOne lookup failed for "${machine.pcName}": ${ninjaError.message}`
          )
        }

        if (ninja) {
          const ninjaId = String(ninja.id)
          const { data: byNinjaId } = await supabase
            .from('devices')
            .select(
              'id, employee_id, device_name, serial_number, asset_tag, asset_type, status, department, location, manufacturer, model, ninja_device_id, is_loaner'
            )
            .eq('ninja_device_id', ninjaId)
            .maybeSingle()

          if (byNinjaId) {
            device = byNinjaId
          } else {
            const createdDev = await createDeviceFromNinja(
              ninja,
              machine.pcName,
              employeeId,
              employeeName,
              location,
              departmentForEmployee(email, jobTitle)
            )
            if (createdDev) {
              devicesCreated++
              deviceCountByEmp.set(
                employeeId,
                (deviceCountByEmp.get(employeeId) || 0) + 1
              )
              const consume = await maybeConsumeStockLot(supabase, {
                device: createdDev,
                nextEmployeeId: employeeId,
                actor,
                force: true,
              })
              const fields = deviceReviewFields(createdDev)
              review.push({
                kind: 'device_created',
                id: createdDev.id,
                ...fields,
                employee_name: employeeName,
                employee_id: employeeId,
                stock_lot: consume.prompt || null,
              })
            }
            return
          }
        } else {
          if (!ninjaFailed) {
            devicesPending++
            errors.push(
              `Onboarding: machine "${machine.pcName}" (${employeeName}) is not in inventory or NinjaOne yet — will check again next sync`
            )
          }
          const { error: queueError } = await supabase
            .from('pending_device_lookups')
            .upsert(
              {
                employee_id: employeeId,
                machine_name: machine.pcName,
                last_checked_at: new Date().toISOString(),
              },
              { onConflict: 'employee_id,machine_name' }
            )
          if (queueError) {
            errors.push(
              `Onboarding: could not queue "${machine.pcName}" for retry: ${queueError.message}`
            )
          }
          const lots = await fetchLotsWithMetrics(supabase)
          const resolution = resolveStockLot(lots, {
            asset_type: null,
            manufacturer: null,
            model: null,
          })
          review.push({
            kind: 'device_pending',
            id: `pending:${employeeId}:${machine.pcName}`,
            label: machine.pcName,
            employee_name: employeeName,
            employee_id: employeeId,
            location,
            stock_lot: promptFromResolution(resolution, null, null),
          })
          return
        }
      }

      if (!device || device.employee_id === employeeId) return

      await closeCurrentAssignments(supabase, device.id)
      if (device.is_loaner) {
        await applyLoanerOnReturn(supabase, device.id)
      }
      const newDept = departmentForEmployee(email, jobTitle)
      await supabase
        .from('devices')
        .update({
          employee_id: employeeId,
          status: 'active',
          department: newDept,
        })
        .eq('id', device.id)
      await insertAssignmentHistory(supabase, {
        deviceId: device.id,
        employeeId,
      })
      await applyLoanerOnAssign(supabase, {
        deviceId: device.id,
        isLoaner: Boolean(device.is_loaner),
        employeeId,
        snapshot: { name: employeeName, email },
      })
      const consume = await maybeConsumeStockLot(supabase, {
        device,
        nextEmployeeId: employeeId,
        actor,
      })
      devicesAssigned++
      deviceCountByEmp.set(employeeId, (deviceCountByEmp.get(employeeId) || 0) + 1)
      const fields = deviceReviewFields({
        ...device,
        status: 'active',
        department: newDept,
      })
      review.push({
        kind: 'device_assigned',
        id: device.id,
        ...fields,
        employee_name: employeeName,
        employee_id: employeeId,
        stock_lot: consume.prompt || null,
      })
      await logAudit({
        actor,
        action: 'device.assign',
        entity_type: 'device',
        entity_id: device.id,
        entity_label: device.device_name || device.serial_number,
        details: {
          via: 'onboarding-sync',
          assigned_to: employeeName,
          machine_mode: machine.mode,
        },
      })
    }

    // ── Retry queue: machines that weren't in NinjaOne on a previous sync ─
    const { data: pendingLookups, error: pendingError } = await supabase
      .from('pending_device_lookups')
      .select('id, employee_id, machine_name')
    if (pendingError) {
      errors.push(
        `Pending-device retry queue unavailable (${pendingError.message}) — run supabase/migrations/06_pending_device_lookups.sql`
      )
    }
    for (const pending of pendingLookups || []) {
      const employee = employeeById.get(pending.employee_id)
      const employeeName = employee?.display_name || employee?.email || 'unknown employee'

      // Manual (or other) assignment already done — drop the queue entry so we
      // don't add a second device when the sheet machine later appears in Ninja.
      if ((deviceCountByEmp.get(pending.employee_id) || 0) > 0) {
        await supabase.from('pending_device_lookups').delete().eq('id', pending.id)
        continue
      }

      const dashIdx = pending.machine_name.indexOf('-')
      const tokens = dashIdx > 0
        ? [pending.machine_name, pending.machine_name.slice(dashIdx + 1)]
        : [pending.machine_name]

      // The machine may have been added to inventory manually in the meantime.
      const inInventory = await findInInventory(tokens, pending.employee_id)
      if (inInventory) {
        if (inInventory.employee_id !== pending.employee_id) {
          const dept = departmentForEmployee(employee?.email, employee?.job_title)
          await closeCurrentAssignments(supabase, inInventory.id)
          await supabase
            .from('devices')
            .update({
              employee_id: pending.employee_id,
              status: 'active',
              department: dept,
            })
            .eq('id', inInventory.id)
          await insertAssignmentHistory(supabase, {
            deviceId: inInventory.id,
            employeeId: pending.employee_id,
          })
          const consume = await maybeConsumeStockLot(supabase, {
            device: inInventory,
            nextEmployeeId: pending.employee_id,
            actor,
          })
          devicesAssigned++
          deviceCountByEmp.set(
            pending.employee_id,
            (deviceCountByEmp.get(pending.employee_id) || 0) + 1
          )
          const fields = deviceReviewFields({ ...inInventory, status: 'active', department: dept })
          review.push({
            kind: 'device_assigned',
            id: inInventory.id,
            ...fields,
            employee_name: employeeName,
            employee_id: pending.employee_id,
            stock_lot: consume.prompt || null,
          })
          await logAudit({
            actor,
            action: 'device.assign',
            entity_type: 'device',
            entity_id: inInventory.id,
            entity_label: inInventory.device_name || inInventory.serial_number,
            details: { via: 'onboarding-sync', assigned_to: employeeName, resolved_from: 'pending queue' },
          })
        }
        await supabase.from('pending_device_lookups').delete().eq('id', pending.id)
        continue
      }

      try {
        const ninja = await findInNinja(tokens)
        if (ninja) {
          const created = await createDeviceFromNinja(
            ninja,
            pending.machine_name,
            pending.employee_id,
            employeeName,
            officeNameToLocation(employee?.office_location || '') || employee?.office_location || null,
            departmentForEmployee(employee?.email, employee?.job_title)
          )
          if (created) {
            devicesCreated++
            deviceCountByEmp.set(
              pending.employee_id,
              (deviceCountByEmp.get(pending.employee_id) || 0) + 1
            )
            const consume = await maybeConsumeStockLot(supabase, {
              device: created,
              nextEmployeeId: pending.employee_id,
              actor,
              force: true,
            })
            const fields = deviceReviewFields(created)
            review.push({
              kind: 'device_created',
              id: created.id,
              ...fields,
              employee_name: employeeName,
              employee_id: pending.employee_id,
              stock_lot: consume.prompt || null,
            })
            await supabase.from('pending_device_lookups').delete().eq('id', pending.id)
          }
        } else {
          devicesPending++
          errors.push(
            `Onboarding: machine "${pending.machine_name}" (${employeeName}) is still not in NinjaOne — will check again next sync`
          )
          await supabase
            .from('pending_device_lookups')
            .update({ last_checked_at: new Date().toISOString() })
            .eq('id', pending.id)
        }
      } catch (ninjaError: any) {
        errors.push(`NinjaOne lookup failed for "${pending.machine_name}": ${ninjaError.message}`)
      }
    }

    // ── Onboarding: newest columns until a known name ─────────────────────
    // Only brand-new hires. Do not walk older columns to assign machines —
    // those people may already have inventory devices that aren't on the sheet.
    const onbGrid = await readWorkbookSheetRaw(workbookRef, ONBOARDING_SHEET)
    const nameRow = findRow(onbGrid, 'Name')
    if (!nameRow) throw new Error(`Onboarding sheet has no "Name" row`)
    const emailRow = findRow(onbGrid, 'Email')
    const usernameRow = findRow(onbGrid, 'Username')
    const titleRow = findRow(onbGrid, 'Employee Title')
    const phoneRow = findRow(onbGrid, 'Phone number')
    const extRow = findRow(onbGrid, 'ext')
    const locationRow = findRow(onbGrid, 'Location')
    const machineRow = findRow(onbGrid, 'Determine if using existing or new machine')

    const onbCols: number[] = []
    const onbColCount = Math.max(...onbGrid.map((r) => (r ? r.length : 0)))
    let onbKnownStreak = 0
    for (let col = 1; col < onbColCount; col++) {
      const name = cellText(nameRow, col)
      if (!name) continue
      const email = cellText(emailRow, col)?.toLowerCase() ?? null
      const alreadyAdded =
        (email && knownEmails.has(email)) || !!matchEmployee(name)
      if (alreadyAdded) {
        onbKnownStreak++
        if (onbKnownStreak >= STOP_AFTER_KNOWN) break
        continue
      }
      onbKnownStreak = 0
      onbCols.push(col)
      if (onbCols.length >= MAX_BATCH) {
        errors.push(
          `Onboarding: stopped after ${MAX_BATCH} new entries — run sync again to continue`
        )
        break
      }
    }
    onbCols.reverse() // oldest of the new batch first

    for (const col of onbCols) {
      const name = cellText(nameRow, col)!
      processed.onboarding.push(name)
      const email = cellText(emailRow, col)?.toLowerCase() ?? null
      const jobTitle = cellText(titleRow, col)
      const location = cellText(locationRow, col)

      if (!email || !email.includes('@')) {
        errors.push(
          `Onboarding: "${name}" has no email on the sheet yet — skipped, will retry next sync`
        )
        continue
      }

      // Race-safe: skip if they appeared in DB since the snapshot (e.g. parallel sync)
      const existingId =
        employeeByEmail.get(email) || matchEmployee(name) || null
      if (existingId) continue

      const { first, last } = splitName(name)
      const employeeData: Record<string, unknown> = {
        entra_id: email,
        email,
        display_name: name,
        first_name: first,
        last_name: last,
        job_title: jobTitle,
        phone_number: cellText(phoneRow, col),
        extension: cellText(extRow, col),
        office_location: location,
        username: cellText(usernameRow, col),
        employment_status: 'active',
        last_synced_at: new Date().toISOString(),
      }

      const { data: created, error: insError } = await supabase
        .from('employees')
        .insert(employeeData)
        .select('id')
        .single()
      if (insError || !created?.id) {
        errors.push(`Onboarding: failed to create ${email}: ${insError?.message}`)
        continue
      }
      const employeeId = created.id as string
      knownEmails.add(email)
      employeeByEmail.set(email, employeeId)
      employeeById.set(employeeId, {
        id: employeeId,
        email,
        display_name: name,
        first_name: first,
        last_name: last,
        employment_status: 'active',
        job_title: jobTitle,
      })
      onboarded++
      review.push({
        kind: 'employee_onboarded',
        id: employeeId,
        label: name,
      })
      await logAudit({
        actor,
        action: 'employee.onboard',
        entity_type: 'employee',
        entity_id: employeeId,
        entity_label: name,
        details: {
          via: 'onboarding-sync',
          email,
          job_title: jobTitle,
          office_location: location,
          machine: cellText(machineRow, col),
        },
      })

      await resolveAndAssignMachine({
        machine: parseMachineCell(cellText(machineRow, col)),
        employeeId,
        employeeName: name,
        email,
        jobTitle,
        location,
      })
    }

    // ── Offboarding: newest columns until already-removed names ───────────
    const offGrid = await readWorkbookSheetRaw(workbookRef, OFFBOARDING_SHEET)
    const offNameRow = findRow(offGrid, 'Employee Name')
    const termDateRow = findRow(offGrid, 'Termination date')
    if (!offNameRow) throw new Error(`Offboarding sheet has no "Employee Name" row`)

    const offCols: number[] = []
    const offColCount = Math.max(offNameRow.length, termDateRow?.length ?? 0)
    let offKnownStreak = 0
    for (let col = 1; col < offColCount; col++) {
      const name = cellText(offNameRow, col)
      if (!name) continue
      const employeeId = matchEmployee(name)
      // Already deleted from a previous sync → done. Still-present rows
      // (including legacy "terminated") are processed so they get removed.
      if (!employeeId) {
        offKnownStreak++
        if (offKnownStreak >= STOP_AFTER_KNOWN) break
        continue
      }
      offKnownStreak = 0
      offCols.push(col)
      if (offCols.length >= MAX_BATCH) {
        errors.push(
          `Offboarding: stopped after ${MAX_BATCH} entries — run sync again to continue`
        )
        break
      }
    }
    offCols.reverse()

    for (const col of offCols) {
      const name = cellText(offNameRow, col)!
      processed.offboarding.push(name)

      const employeeId = matchEmployee(name)
      if (!employeeId) {
        // Already removed by a previous sync (or never existed).
        continue
      }

      const termIso = termDateRow ? excelValueToIsoDate(termDateRow[col]) : null

      // Return their devices: unassign + back to stock
      const { data: theirDevices } = await supabase
        .from('devices')
        .select(
          'id, device_name, serial_number, asset_type, status, department, location, manufacturer, model, is_loaner'
        )
        .eq('employee_id', employeeId)

      for (const device of theirDevices || []) {
        devicesReturned++
        const fields = deviceReviewFields({ ...device, status: 'in_stock' })
        review.push({
          kind: 'device_returned',
          id: device.id,
          ...fields,
          employee_name: name,
        })
        await logAudit({
          actor,
          action: 'device.return',
          entity_type: 'device',
          entity_id: device.id,
          entity_label: device.device_name || device.serial_number,
          details: { via: 'onboarding-sync', returned_from: name, new_status: 'in_stock' },
        })
      }

      let result
      try {
        result = await removeEmployeeFromProgram(supabase, employeeId, {
          actor,
          via: 'onboarding-sync',
          terminationDate: termIso,
        })
      } catch (e: any) {
        errors.push(`Offboarding: failed to remove ${name}: ${e?.message || e}`)
        continue
      }
      if (!result) continue

      employeeById.delete(employeeId)
      offboarded++
      review.push({
        kind: 'employee_offboarded',
        id: employeeId,
        label: name,
      })
    }

    // ── New Ninja devices not yet in inventory (servers / unassigned gear) ─
    // Match key = serial_number (plus already-linked ninja_device_id).
    // Name is NOT used for matching. Serial hits link ninja_device_id only.
    try {
      if (!ninjaDevices) ninjaDevices = await ninjaOne.getDevices()

      const { data: existingDevices, error: existingErr } = await supabase
        .from('devices')
        .select('id, ninja_device_id, serial_number')
      if (existingErr) throw existingErr

      const byNinjaId = new Set<string>()
      const bySerial = new Map<string, { id: string; ninja_device_id: string | null }>()
      for (const d of existingDevices || []) {
        if (d.ninja_device_id) byNinjaId.add(String(d.ninja_device_id))
        const serial = normalizeSerial(d.serial_number)
        if (serial && !bySerial.has(serial)) {
          bySerial.set(serial, {
            id: d.id,
            ninja_device_id: d.ninja_device_id ? String(d.ninja_device_id) : null,
          })
        }
      }

      let linkedExisting = 0
      const linkExistingBySerial = async (
        ninjaId: string,
        serialKey: string,
        label: string
      ): Promise<boolean> => {
        const existing = bySerial.get(serialKey)
        if (!existing) return false
        if (!existing.ninja_device_id) {
          const { error: linkErr } = await supabase
            .from('devices')
            .update({
              ninja_device_id: ninjaId,
              is_in_ninja: true,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
          if (linkErr) {
            errors.push(
              `Ninja inventory: could not link "${label}" to existing serial: ${linkErr.message}`
            )
            return true
          }
          existing.ninja_device_id = ninjaId
          linkedExisting++
        }
        byNinjaId.add(ninjaId)
        return true
      }

      const unmatched: any[] = []
      for (const n of ninjaDevices || []) {
        const ninjaId = String(n.id ?? '')
        if (!ninjaId || byNinjaId.has(ninjaId)) continue

        const listSerial = ninjaSerialKey(n)
        if (listSerial && bySerial.has(listSerial)) {
          await linkExistingBySerial(
            ninjaId,
            listSerial,
            String(n.systemName || n.dnsName || ninjaId)
          )
          continue
        }
        unmatched.push(n)
      }

      const MAX_NINJA_NEW = 100
      const MAX_DETAIL_FETCHES = MAX_NINJA_NEW * 3
      let examined = 0
      const ninjaLots = await fetchLotsWithMetrics(supabase)

      for (let i = 0; i < unmatched.length; i++) {
        if (ninjaNew >= MAX_NINJA_NEW) break
        if (examined >= MAX_DETAIL_FETCHES) break

        const hit = unmatched[i]
        examined++
        const ninjaId = String(hit.id)

        let details: any = hit
        try {
          details = { ...hit, ...(await ninjaOne.getDevice(ninjaId)) }
        } catch (detailErr: any) {
          errors.push(
            `Ninja inventory: could not load details for "${hit.systemName || hit.id}": ${detailErr.message}`
          )
          continue
        }

        const serialKey = ninjaSerialKey(details)
        const label = String(details.systemName || details.dnsName || hit.systemName || ninjaId)

        if (serialKey && (await linkExistingBySerial(ninjaId, serialKey, label))) {
          continue
        }

        const row = ninjaInsertRow(details)
        row.notes = 'Added by onboarding sync from NinjaOne (unassigned)'

        const { data: inserted, error: insErr } = await supabase
          .from('devices')
          .insert(row)
          .select(
            'id, device_name, asset_type, status, department, location, serial_number, manufacturer, model, is_loaner'
          )
          .single()

        if (insErr || !inserted) {
          errors.push(
            `Ninja inventory: failed to add "${row.device_name}": ${insErr?.message || 'unknown error'}`
          )
          continue
        }

        ninjaNew++
        byNinjaId.add(ninjaId)
        if (serialKey) {
          bySerial.set(serialKey, {
            id: inserted.id,
            ninja_device_id: ninjaId,
          })
        }

        const fields = deviceReviewFields(inserted)
        review.push({
          kind: 'ninja_new',
          id: inserted.id,
          ...fields,
          employee_name: null,
          stock_lot: promptForDevice(ninjaLots, inserted),
        })
        await logAudit({
          actor,
          action: 'device.create',
          entity_type: 'device',
          entity_id: inserted.id,
          entity_label: String(row.device_name),
          details: {
            source: 'ninjaone',
            via: 'onboarding-sync-ninja-inventory',
            unassigned: true,
            manufacturer: row.manufacturer,
            model: row.model,
            serial_number: row.serial_number,
          },
        })
      }

      const remaining = unmatched.length - examined
      if (ninjaNew >= MAX_NINJA_NEW && remaining > 0) {
        errors.push(
          `Ninja inventory: imported ${ninjaNew} new devices this run` +
            (linkedExisting > 0 ? ` (linked ${linkedExisting} by serial)` : '') +
            `; ~${remaining} candidates left — sync again for more`
        )
      } else if (examined >= MAX_DETAIL_FETCHES && remaining > 0) {
        errors.push(
          `Ninja inventory: examined ${examined} candidates (imported ${ninjaNew}` +
            (linkedExisting > 0 ? `, linked ${linkedExisting}` : '') +
            `); ~${remaining} left — sync again for more`
        )
      } else if (linkedExisting > 0 && ninjaNew === 0) {
        errors.push(
          `Ninja inventory: no new rows to insert; linked ${linkedExisting} existing device(s) to NinjaOne by serial`
        )
      }
    } catch (ninjaInvErr: any) {
      errors.push(`Ninja inventory pass failed: ${ninjaInvErr.message}`)
    }

    try {
      const { data: officeRows, error: officeError } = await supabase.from('offices').select('name')
      if (officeError) throw officeError
      const allowedLocations = Array.from(
        new Set([
          ...chargeOfficeOptions((officeRows || []).map((row: { name?: string | null }) => row.name)),
          'Remote',
        ])
      )
      const azureUsers = await listAzureDirectoryUsers()
      const azureByEmail = new Map<string, (typeof azureUsers)[number]>()
      for (const user of azureUsers) {
        const key = azureUserEmailKey(user)
        if (key) azureByEmail.set(key, user)
      }
      const skipIds = new Set(
        review
          .filter((item) => item.kind === 'employee_onboarded' || item.kind === 'employee_offboarded')
          .map((item) => item.id)
      )
      const MAX_AZURE_PROFILE = 50
      for (const emp of allEmployees || []) {
        if (skipIds.has(emp.id)) continue
        const email = String(emp.email || '').toLowerCase()
        if (!email) continue
        const azure = azureByEmail.get(email)
        if (!azure) continue
        const diff = diffAzureEmployee({
          employeeId: emp.id,
          label: emp.display_name || email,
          email,
          currentJobTitle: emp.job_title,
          currentOffice: emp.office_location,
          currentDepartment: emp.department,
          azureJobTitle: azure.jobTitle,
          azureOffice: azure.officeLocation,
          azureDepartment: azure.department,
          ackedJobTitle: emp.azure_job_title_acked,
          ackedOffice: emp.azure_office_acked,
          ackedDepartment: emp.azure_department_acked,
          allowedLocations,
        })
        if (!diff) continue
        if (azureUpdated >= MAX_AZURE_PROFILE) {
          errors.push(
            `Azure profile: imported ${MAX_AZURE_PROFILE} title/office/department changes this run; sync again for more`
          )
          break
        }
        azureUpdated += 1
        review.push({
          kind: 'employee_updated',
          id: diff.employeeId,
          label: diff.label,
          employee_id: diff.employeeId,
          employee_name: diff.label,
          job_title: diff.currentJobTitle,
          proposed_job_title: diff.proposedJobTitle,
          office_location: diff.currentOffice,
          proposed_office_location: diff.proposedOffice,
          department: diff.currentDepartment,
          proposed_department: diff.proposedDepartment,
          azure_job_title: diff.azureJobTitle,
          azure_office_location: diff.azureOffice,
          azure_department: diff.azureDepartment,
        })
      }
    } catch (azureErr: any) {
      errors.push(`Azure title/office pass failed: ${azureErr.message}`)
    }

    await finishLog({
      status: errors.length > 0 ? 'partial' : 'success',
      records_synced: onboarded + updated + offboarded + ninjaNew + azureUpdated,
      records_failed: errors.length,
      error_message: errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
    })

    await logAudit({
      actor,
      action: 'sync.onboarding',
      entity_type: 'sync',
      entity_label: 'Onboarding / Offboarding sync',
      details: {
        stats: {
          onboarded,
          devicesAssigned,
          devicesCreated,
          devicesPending,
          offboarded,
          devicesReturned,
          ninjaNew,
          azureUpdated,
        },
        warnings: errors.length,
      },
    })

    return NextResponse.json({
      success: true,
      processed,
      stats: {
        onboarded,
        updated,
        devicesAssigned,
        devicesCreated,
        devicesPending,
        offboarded,
        devicesReturned,
        ninjaNew,
        azureUpdated,
      },
      review: { items: review },
      errors: errors.slice(0, 100),
      duration: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    })
  } catch (error: any) {
    console.error('Onboarding sync error:', error)
    await finishLog({ status: 'failed', error_message: error.message })
    return NextResponse.json(
      { error: error.message || 'Failed to run onboarding sync' },
      { status: 500 }
    )
  }
}

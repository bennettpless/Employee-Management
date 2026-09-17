/**
 * Shared NinjaOne ↔ EMS inventory matching.
 *
 * Match order:
 *   1. ninja_device_id already on an EMS row
 *   2. normalized serial (≥4 chars)
 *   3. compact hostname / systemName (possible duplicate — not a hard match)
 */

export type NinjaMatchKind = 'already_in_ems' | 'possible_duplicate' | 'unique'

export interface EmsMatchRow {
  id: string
  ninja_device_id: string | null
  serial_number: string | null
  device_name: string | null
}

export interface EmsMatchIndex {
  byNinjaId: Map<string, EmsMatchRow>
  bySerial: Map<string, EmsMatchRow>
  devices: EmsMatchRow[]
}

export type NinjaMatch =
  | { kind: 'already_in_ems'; ems: EmsMatchRow; reason: 'ninja_device_id' | 'serial' }
  | { kind: 'possible_duplicate'; ems: EmsMatchRow; reason: 'name' }
  | { kind: 'unique' }

export interface NinjaReviewCandidate {
  ninjaId: string
  deviceName: string
  serialNumber: string | null
  assetType: string | null
  nodeClass: string | null
  manufacturer: string | null
  model: string | null
  lastSeen: string | null
  kind: Exclude<NinjaMatchKind, 'already_in_ems'>
  matchReason: string
  emsDevice: {
    id: string
    device_name: string | null
    serial_number: string | null
    ninja_device_id: string | null
  } | null
}

/** Normalize a serial for matching (case-insensitive; ignore short / empty). */
export function normalizeSerial(raw: unknown): string | null {
  const key = String(raw ?? '')
    .toLowerCase()
    .trim()
  return key.length >= 4 ? key : null
}

/** Pull serial from a Ninja list or detail payload. */
export function ninjaSerialKey(ninja: any): string | null {
  return (
    normalizeSerial(ninja?.system?.serialNumber) ||
    normalizeSerial(ninja?.system?.biosSerialNumber) ||
    normalizeSerial(ninja?.serialNumber) ||
    null
  )
}

/** Strip separators so "BPL-5XBKPK4" matches "BPL5XBKPK4" / FQDNs. */
export function compactDeviceName(s: unknown): string {
  const host = String(s ?? '').trim().split('.')[0]
  return host.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function namesLikelyMatch(a: unknown, b: unknown): boolean {
  const ca = compactDeviceName(a)
  const cb = compactDeviceName(b)
  if (!ca || !cb || ca.length < 4 || cb.length < 4) return false
  return ca === cb || ca.endsWith(cb) || cb.endsWith(ca)
}

export function chassisToAssetType(nodeClass: unknown, chassisType: unknown): string | null {
  const nc = String(nodeClass ?? '').toLowerCase()
  if (nc.includes('server')) return 'server'
  const chassis = String(chassisType ?? '').toLowerCase()
  if (/laptop|notebook|portable|convertible/.test(chassis)) return 'laptop'
  if (/desktop|tower|mini|small form|sff/.test(chassis)) return 'desktop'
  return null
}

export function ninjaLastSeenIso(ninja: any): string | null {
  if (!ninja?.lastContact) return null
  const ts = parseFloat(ninja.lastContact)
  if (!Number.isFinite(ts)) return null
  return new Date(ts * 1000).toISOString()
}

export function ninjaDisplayName(ninja: any, fallback = 'Ninja device'): string {
  return String(ninja?.systemName || ninja?.dnsName || fallback)
}

export function ninjaHardware(ninja: any): {
  manufacturer: string | null
  model: string | null
  serial: string | null
  assetType: string
  nodeClass: string | null
} {
  return {
    manufacturer: ninja?.system?.manufacturer || ninja?.manufacturer || null,
    model: ninja?.system?.model || ninja?.model || null,
    serial:
      ninja?.system?.serialNumber ||
      ninja?.system?.biosSerialNumber ||
      ninja?.serialNumber ||
      null,
    assetType: chassisToAssetType(ninja?.nodeClass, ninja?.system?.chassisType) || 'other',
    nodeClass: ninja?.nodeClass || null,
  }
}

export function buildEmsMatchIndex(devices: EmsMatchRow[]): EmsMatchIndex {
  const byNinjaId = new Map<string, EmsMatchRow>()
  const bySerial = new Map<string, EmsMatchRow>()
  for (const d of devices) {
    if (d.ninja_device_id) byNinjaId.set(String(d.ninja_device_id), d)
    const serial = normalizeSerial(d.serial_number)
    if (serial && !bySerial.has(serial)) bySerial.set(serial, d)
  }
  return { byNinjaId, bySerial, devices }
}

export function matchNinjaAgainstEms(ninja: any, index: EmsMatchIndex): NinjaMatch {
  const ninjaId = String(ninja?.id ?? '')
  if (ninjaId && index.byNinjaId.has(ninjaId)) {
    return {
      kind: 'already_in_ems',
      ems: index.byNinjaId.get(ninjaId)!,
      reason: 'ninja_device_id',
    }
  }

  const serialKey = ninjaSerialKey(ninja)
  if (serialKey && index.bySerial.has(serialKey)) {
    return {
      kind: 'already_in_ems',
      ems: index.bySerial.get(serialKey)!,
      reason: 'serial',
    }
  }

  const ninjaNames = [ninja?.systemName, ninja?.dnsName]
  for (const ems of index.devices) {
    if (ninjaNames.some((n) => namesLikelyMatch(n, ems.device_name))) {
      return { kind: 'possible_duplicate', ems, reason: 'name' }
    }
  }

  return { kind: 'unique' }
}

export function candidateFromNinja(
  ninja: any,
  match: NinjaMatch
): NinjaReviewCandidate | null {
  const ninjaId = String(ninja?.id ?? '')
  if (!ninjaId) return null
  if (match.kind === 'already_in_ems') return null

  const hw = ninjaHardware(ninja)
  return {
    ninjaId,
    deviceName: ninjaDisplayName(ninja, `Ninja ${ninjaId}`),
    serialNumber: hw.serial,
    assetType: hw.assetType,
    nodeClass: hw.nodeClass,
    manufacturer: hw.manufacturer,
    model: hw.model,
    lastSeen: ninjaLastSeenIso(ninja),
    kind: match.kind,
    matchReason:
      match.kind === 'possible_duplicate'
        ? `Name similar to EMS device "${match.ems.device_name || match.ems.id}"`
        : 'No ninja id, serial, or hostname match',
    emsDevice:
      match.kind === 'possible_duplicate'
        ? {
            id: match.ems.id,
            device_name: match.ems.device_name,
            serial_number: match.ems.serial_number,
            ninja_device_id: match.ems.ninja_device_id,
          }
        : null,
  }
}

export function ninjaInsertRow(ninja: any): Record<string, unknown> {
  const hw = ninjaHardware(ninja)
  const ninjaId = String(ninja.id)
  return {
    device_name: ninjaDisplayName(ninja, `Ninja ${ninjaId}`),
    ninja_device_id: ninjaId,
    is_in_ninja: true,
    device_type: hw.nodeClass,
    asset_type: hw.assetType,
    manufacturer: hw.manufacturer,
    model: hw.model,
    serial_number: hw.serial,
    os_name: ninja?.os?.name || null,
    os_version: ninja?.os?.version || null,
    last_seen: ninjaLastSeenIso(ninja),
    employee_id: null,
    status: 'in_stock',
    notes: 'Added from NinjaOne review (unassigned)',
    last_synced_at: new Date().toISOString(),
  }
}

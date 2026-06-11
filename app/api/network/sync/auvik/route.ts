import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'
import { isAuvikConfigured } from '@/lib/env'
import {
  getAuvikClient,
  mapAuvikDeviceType,
  mapAuvikStatus,
  type AuvikClient,
  type AuvikDevice,
} from '@/lib/auvik'

type ServiceSupabase = ReturnType<typeof getServiceSupabase>

export const maxDuration = 600
export const runtime = 'nodejs'

interface AuvikSyncResult {
  networksProcessed: number
  networksSkipped: number
  devicesUpserted: number
  devicesSkipped: number
  devicesFailed: number
  connectionsUpserted: number
  connectionsSkipped: number
  connectionsFailed: number
  errors: string[]
}

/**
 * GET /api/network/sync/auvik
 *
 * Lightweight status endpoint used by the sync, settings, and network pages
 * to decide whether to render the Auvik UI. Returns the latest sync_logs row
 * for `sync_type = 'auvik'` so the UI can show last-run summary.
 */
export async function GET() {
  const configured = isAuvikConfigured()

  let lastSync: unknown = null
  if (configured) {
    try {
      const supabase = getServiceSupabase()
      const { data } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('sync_type', 'auvik')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      lastSync = data
    } catch {
      lastSync = null
    }
  }

  return NextResponse.json(
    { configured, lastSync },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  )
}

/**
 * POST /api/network/sync/auvik
 *
 * Runs the Auvik → Supabase sync. Auth is the same belt-and-suspenders pattern
 * as `/api/sync/ninjaone`: a `Bearer ${SYNC_CRON_SECRET}` header from cron OR
 * an authenticated admin session in the browser. If Auvik isn't configured we
 * return 503 with a friendly error so the cron and the UI can both detect the
 * missing-env case without reading the response body for a magic string.
 */
export async function POST(request: NextRequest) {
  if (!isAuvikConfigured()) {
    return NextResponse.json(
      {
        error:
          'Auvik is not configured. Set AUVIK_API_USER, AUVIK_API_KEY, and AUVIK_TENANT_DOMAIN, then restart the server.',
      },
      { status: 503 }
    )
  }

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.SYNC_CRON_SECRET
  const hasCronSecret =
    Boolean(authHeader) &&
    Boolean(cronSecret) &&
    authHeader === `Bearer ${cronSecret}`

  if (!hasCronSecret) {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role or valid cron secret required' },
        { status: 401 }
      )
    }
  }

  const client = getAuvikClient()
  if (!client) {
    return NextResponse.json(
      { error: 'Auvik client unavailable' },
      { status: 503 }
    )
  }

  const supabase = getServiceSupabase()
  const startTime = Date.now()

  const { data: syncLog, error: logError } = await supabase
    .from('sync_logs')
    .insert({
      sync_type: 'auvik',
      status: 'success',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (logError || !syncLog) {
    console.error('Failed to create Auvik sync_log row:', logError)
    return NextResponse.json(
      { error: 'Failed to create sync log row' },
      { status: 500 }
    )
  }

  const result: AuvikSyncResult = {
    networksProcessed: 0,
    networksSkipped: 0,
    devicesUpserted: 0,
    devicesSkipped: 0,
    devicesFailed: 0,
    connectionsUpserted: 0,
    connectionsSkipped: 0,
    connectionsFailed: 0,
    errors: [],
  }

  try {
    const { data: officeRows, error: officeErr } = await supabase
      .from('offices')
      .select('id, name, auvik_network_id')

    if (officeErr) throw officeErr

    const officeByAuvikNetworkId = new Map<string, { id: string; name: string }>()
    for (const o of officeRows ?? []) {
      if (o.auvik_network_id) {
        officeByAuvikNetworkId.set(o.auvik_network_id, { id: o.id, name: o.name })
      }
    }

    const networks = await client.listNetworks()

    for (const network of networks) {
      const matchingOffice = officeByAuvikNetworkId.get(network.id)
      if (!matchingOffice) {
        result.networksSkipped++
        result.errors.push(
          `Auvik network "${network.attributes?.networkName ?? network.id}" (${network.id}) has no matching office.auvik_network_id; skipped.`
        )
        continue
      }
      result.networksProcessed++

      try {
        await syncDevicesForNetwork(
          client,
          supabase,
          network.id,
          matchingOffice.id,
          result
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(
          `Failed to sync devices for office "${matchingOffice.name}" (Auvik network ${network.id}): ${msg}`
        )
      }

      try {
        await syncConnectionsForNetwork(client, supabase, network.id, result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        result.errors.push(
          `Failed to sync connections for office "${matchingOffice.name}" (Auvik network ${network.id}): ${msg}`
        )
      }
    }

    const duration = Math.floor((Date.now() - startTime) / 1000)
    const recordsSynced = result.devicesUpserted + result.connectionsUpserted
    const recordsFailed =
      result.devicesFailed + result.connectionsFailed + result.networksSkipped

    const status: 'success' | 'partial' | 'failed' =
      recordsFailed > 0 || result.errors.length > 0 ? 'partial' : 'success'

    await supabase
      .from('sync_logs')
      .update({
        status,
        records_synced: recordsSynced,
        records_failed: recordsFailed,
        error_message:
          result.errors.length > 0 ? result.errors.join(' | ').slice(0, 4000) : null,
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
      })
      .eq('id', syncLog.id)

    return NextResponse.json({
      success: true,
      duration,
      ...result,
    })
  } catch (error) {
    const duration = Math.floor((Date.now() - startTime) / 1000)
    const message = error instanceof Error ? error.message : String(error)
    console.error('Auvik sync error:', error)

    await supabase
      .from('sync_logs')
      .update({
        status: 'failed',
        records_synced: result.devicesUpserted + result.connectionsUpserted,
        records_failed:
          result.devicesFailed + result.connectionsFailed + 1,
        error_message: message.slice(0, 4000),
        completed_at: new Date().toISOString(),
        duration_seconds: duration,
      })
      .eq('id', syncLog.id)

    return NextResponse.json(
      { error: message || 'Failed to sync Auvik data' },
      { status: 500 }
    )
  }
}

async function syncDevicesForNetwork(
  client: AuvikClient,
  supabase: ServiceSupabase,
  auvikNetworkId: string,
  officeId: string,
  result: AuvikSyncResult
) {
  const devices = await client.listDevices(auvikNetworkId)

  // Pre-fetch any existing rows for these Auvik device IDs so we can honour
  // is_manually_overridden without an extra round trip per device.
  const auvikIds = devices.map((d) => d.id)
  const existingByAuvikId = new Map<
    string,
    { id: string; is_manually_overridden: boolean }
  >()
  if (auvikIds.length > 0) {
    const { data: existing } = await supabase
      .from('network_devices')
      .select('id, auvik_device_id, is_manually_overridden')
      .in('auvik_device_id', auvikIds)
    if (existing) {
      for (const row of existing as Array<{
        id: string
        auvik_device_id: string | null
        is_manually_overridden: boolean
      }>) {
        if (row.auvik_device_id) {
          existingByAuvikId.set(row.auvik_device_id, {
            id: row.id,
            is_manually_overridden: row.is_manually_overridden,
          })
        }
      }
    }
  }

  for (const device of devices) {
    try {
      const existing = existingByAuvikId.get(device.id)
      if (existing?.is_manually_overridden) {
        result.devicesSkipped++
        continue
      }

      const deviceType = mapAuvikDeviceType(device.attributes?.deviceType)
      if (!deviceType) {
        result.devicesSkipped++
        result.errors.push(
          `Auvik device ${device.id} (type "${device.attributes?.deviceType ?? 'unknown'}") not in mapping; skipped.`
        )
        continue
      }

      const payload = buildDevicePayload(device, deviceType, officeId)

      if (existing) {
        const { error } = await supabase
          .from('network_devices')
          .update(payload)
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('network_devices')
          .insert({ ...payload, auvik_device_id: device.id })
        if (error) throw error
      }
      result.devicesUpserted++
    } catch (err) {
      result.devicesFailed++
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Device ${device.id}: ${msg}`)
    }
  }
}

function buildDevicePayload(
  device: AuvikDevice,
  deviceType: ReturnType<typeof mapAuvikDeviceType>,
  officeId: string
) {
  const a = device.attributes ?? {}
  const ipAddresses = Array.isArray(a.ipAddresses) ? a.ipAddresses : []
  const managementIp =
    typeof ipAddresses[0] === 'string' ? ipAddresses[0] : null

  return {
    office_id: officeId,
    name: a.deviceName || `Auvik device ${device.id}`,
    device_type: deviceType,
    manufacturer: a.vendorName ?? null,
    model: a.makeModel ?? null,
    serial_number: a.serialNumber ?? null,
    firmware_version: a.firmwareVersion ?? a.softwareVersion ?? null,
    management_ip: managementIp,
    mac_address: a.macAddress ?? null,
    status: mapAuvikStatus(a.onlineStatus),
    last_seen: a.lastSeenTime ?? null,
    source: 'auvik' as const,
    last_synced_at: new Date().toISOString(),
  }
}

async function syncConnectionsForNetwork(
  client: AuvikClient,
  supabase: ServiceSupabase,
  auvikNetworkId: string,
  result: AuvikSyncResult
) {
  const connections = await client.listConnections(auvikNetworkId)
  if (connections.length === 0) return

  // Resolve Auvik device IDs → our network_devices.id once for the whole batch.
  const auvikDeviceIds = new Set<string>()
  for (const conn of connections) {
    const fromId = conn.relationships?.fromDevice?.data?.id
    const toId = conn.relationships?.toDevice?.data?.id
    if (fromId) auvikDeviceIds.add(fromId)
    if (toId) auvikDeviceIds.add(toId)
  }

  const idMap = new Map<string, string>()
  if (auvikDeviceIds.size > 0) {
    const { data: rows } = await supabase
      .from('network_devices')
      .select('id, auvik_device_id')
      .in('auvik_device_id', Array.from(auvikDeviceIds))
    for (const row of (rows ?? []) as Array<{
      id: string
      auvik_device_id: string | null
    }>) {
      if (row.auvik_device_id) idMap.set(row.auvik_device_id, row.id)
    }
  }

  for (const conn of connections) {
    try {
      const fromAuvikId = conn.relationships?.fromDevice?.data?.id
      const toAuvikId = conn.relationships?.toDevice?.data?.id

      if (!fromAuvikId || !toAuvikId) {
        result.connectionsSkipped++
        continue
      }

      const sourceId = idMap.get(fromAuvikId)
      const targetId = idMap.get(toAuvikId)
      if (!sourceId || !targetId) {
        result.connectionsSkipped++
        continue
      }

      const linkType = mapConnectionType(conn.attributes?.connectionType)

      const { data: existing } = await supabase
        .from('network_device_connections')
        .select('id')
        .eq('auvik_link_id', conn.id)
        .maybeSingle()

      const payload = {
        source_device_id: sourceId,
        target_device_id: targetId,
        source_port: conn.attributes?.fromInterface ?? null,
        target_port: conn.attributes?.toInterface ?? null,
        link_type: linkType,
        last_synced_at: new Date().toISOString(),
      }

      if (existing) {
        const { error } = await supabase
          .from('network_device_connections')
          .update(payload)
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('network_device_connections')
          .insert({ ...payload, auvik_link_id: conn.id })
        if (error) {
          // The schema enforces a UNIQUE on (source, target, source_port,
          // target_port). If a manual edge already covers this link we just
          // attach the auvik_link_id to it via a follow-up update rather than
          // exploding the whole sync.
          if (error.code === '23505') {
            await supabase
              .from('network_device_connections')
              .update({ auvik_link_id: conn.id, last_synced_at: payload.last_synced_at })
              .match({
                source_device_id: payload.source_device_id,
                target_device_id: payload.target_device_id,
                source_port: payload.source_port,
                target_port: payload.target_port,
              })
          } else {
            throw error
          }
        }
      }
      result.connectionsUpserted++
    } catch (err) {
      result.connectionsFailed++
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Connection ${conn.id}: ${msg}`)
    }
  }
}

function mapConnectionType(
  raw: string | undefined
): 'ethernet' | 'fiber' | 'wireless' | 'other' | null {
  if (!raw) return null
  const normalized = raw.toLowerCase()
  if (normalized.includes('wireless') || normalized.includes('wifi')) return 'wireless'
  if (normalized.includes('fiber') || normalized.includes('optical')) return 'fiber'
  if (normalized.includes('ethernet') || normalized.includes('copper')) return 'ethernet'
  return 'other'
}

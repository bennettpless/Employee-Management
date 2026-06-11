/**
 * Lazy-init Auvik API client.
 *
 * Mirrors the pattern used by `lib/ninjaone.ts`: the client is `null` until the
 * first call to `getAuvikClient()`, returns `null` when env vars are missing,
 * and is constructed once and cached otherwise. This keeps the entire Auvik
 * feature truly optional — pages and routes can short-circuit if the client is
 * `null` without throwing at import time.
 *
 * Auvik uses HTTP Basic auth (`AUVIK_API_USER:AUVIK_API_KEY`) and JSON:API
 * style cursor pagination (`links.next` URLs). On `429 Too Many Requests` the
 * client respects `Retry-After` (defaulting to 30s) and retries up to 3 times.
 *
 * NOTE on the base URL: Phase 17's spec uses
 *   `https://api.${AUVIK_TENANT_DOMAIN}.my.auvik.com/v1`
 * If your Auvik tenant uses a region-host pattern (e.g.
 * `https://auvikapi.us1.my.auvik.com/v1`) the operator can override by setting
 * `AUVIK_API_BASE_URL` to a full URL.
 */

interface AuvikConfig {
  apiUser: string
  apiKey: string
  tenantDomain: string
  baseUrlOverride?: string
}

type AuvikRelationship =
  | { data?: { id: string; type: string } | null }
  | { data?: { id: string; type: string }[] | null }

interface AuvikJsonApiResource<
  TAttrs extends Record<string, unknown> = Record<string, unknown>,
  TRels extends Record<string, AuvikRelationship> = Record<string, AuvikRelationship>,
> {
  id: string
  type?: string
  attributes: TAttrs
  relationships?: TRels
}

interface AuvikJsonApiResponse<T> {
  data: T | T[]
  links?: {
    next?: string
  }
}

export type AuvikNetwork = AuvikJsonApiResource<{
  networkName?: string
  networkType?: string
  description?: string
  scanStatus?: string
  [key: string]: unknown
}>

export type AuvikDevice = AuvikJsonApiResource<
  {
    deviceName?: string
    deviceType?: string
    makeModel?: string
    vendorName?: string
    serialNumber?: string
    softwareVersion?: string
    firmwareVersion?: string
    ipAddresses?: string[]
    macAddress?: string
    onlineStatus?: string
    lastSeenTime?: string
    lastModified?: string
    [key: string]: unknown
  },
  {
    networks?: { data?: { id: string; type: string } | null }
  }
>

export type AuvikConnection = AuvikJsonApiResource<
  {
    connectionType?: string
    fromInterface?: string
    toInterface?: string
    [key: string]: unknown
  },
  {
    fromDevice?: { data?: { id: string; type: string } | null }
    toDevice?: { data?: { id: string; type: string } | null }
  }
>

type AnyAuvikResource = AuvikJsonApiResource

export class AuvikClient {
  private readonly baseUrl: string
  private readonly authHeader: string
  private readonly maxRetries = 3
  private readonly defaultRetryAfterSeconds = 30

  constructor(config: AuvikConfig) {
    this.baseUrl =
      config.baseUrlOverride ??
      `https://api.${config.tenantDomain}.my.auvik.com/v1`
    this.authHeader = `Basic ${Buffer.from(`${config.apiUser}:${config.apiKey}`).toString('base64')}`
  }

  private async fetchWithBackoff(
    url: string,
    attempt = 1
  ): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    })

    if (response.status === 429 && attempt <= this.maxRetries) {
      const retryAfterRaw = response.headers.get('retry-after')
      const retryAfterSeconds =
        retryAfterRaw && Number.isFinite(Number(retryAfterRaw))
          ? Number(retryAfterRaw)
          : this.defaultRetryAfterSeconds
      await new Promise((r) => setTimeout(r, retryAfterSeconds * 1000))
      return this.fetchWithBackoff(url, attempt + 1)
    }

    return response
  }

  private async getAll<T extends AnyAuvikResource>(
    initialPath: string
  ): Promise<T[]> {
    const all: T[] = []
    let nextUrl: string | null = initialPath.startsWith('http')
      ? initialPath
      : `${this.baseUrl}${initialPath}`

    while (nextUrl) {
      const response: Response = await this.fetchWithBackoff(nextUrl)
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(
          `Auvik API ${response.status} ${response.statusText} for ${nextUrl}${body ? ` — ${body.slice(0, 200)}` : ''}`
        )
      }
      const json = (await response.json()) as AuvikJsonApiResponse<T>
      const data = Array.isArray(json.data) ? json.data : json.data ? [json.data] : []
      all.push(...data)
      nextUrl = json.links?.next ?? null
    }

    return all
  }

  async listNetworks(): Promise<AuvikNetwork[]> {
    return this.getAll<AuvikNetwork>('/inventory/network/info')
  }

  async listDevices(networkId?: string): Promise<AuvikDevice[]> {
    const path = networkId
      ? `/inventory/device/info?filter[networkId]=${encodeURIComponent(networkId)}`
      : '/inventory/device/info'
    return this.getAll<AuvikDevice>(path)
  }

  async getDeviceDetail(deviceId: string): Promise<AuvikDevice | null> {
    const url = `${this.baseUrl}/inventory/device/detail/${encodeURIComponent(deviceId)}`
    const response = await this.fetchWithBackoff(url)
    if (response.status === 404) return null
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Auvik API ${response.status} ${response.statusText} for ${url}${body ? ` — ${body.slice(0, 200)}` : ''}`
      )
    }
    const json = (await response.json()) as AuvikJsonApiResponse<AuvikDevice>
    return Array.isArray(json.data) ? (json.data[0] ?? null) : (json.data ?? null)
  }

  async listConnections(networkId?: string): Promise<AuvikConnection[]> {
    const path = networkId
      ? `/inventory/entity/network/connection?filter[networkId]=${encodeURIComponent(networkId)}`
      : '/inventory/entity/network/connection'
    return this.getAll<AuvikConnection>(path)
  }
}

let cachedClient: AuvikClient | null = null

/**
 * Returns a cached `AuvikClient` instance, or `null` when any of the three
 * required env vars (`AUVIK_API_USER`, `AUVIK_API_KEY`, `AUVIK_TENANT_DOMAIN`)
 * is unset. Callers MUST handle the `null` case — Auvik is optional.
 */
export function getAuvikClient(): AuvikClient | null {
  if (
    !process.env.AUVIK_API_USER ||
    !process.env.AUVIK_API_KEY ||
    !process.env.AUVIK_TENANT_DOMAIN
  ) {
    return null
  }
  if (!cachedClient) {
    cachedClient = new AuvikClient({
      apiUser: process.env.AUVIK_API_USER,
      apiKey: process.env.AUVIK_API_KEY,
      tenantDomain: process.env.AUVIK_TENANT_DOMAIN,
      baseUrlOverride: process.env.AUVIK_API_BASE_URL || undefined,
    })
  }
  return cachedClient
}

import type {
  NetworkDeviceStatus,
  NetworkDeviceType,
} from '@/lib/types'

/**
 * Maps Auvik's granular `deviceType` values to the 6-category enum we store on
 * `network_devices.device_type`. Devices whose `deviceType` is not in this map
 * are intentionally skipped (not inserted as `'other'`) to avoid noise from
 * VoIP phones, printers, workstations, etc. The Phase 17 implementation notes
 * call out that this mapping should be tuned to actual Auvik output.
 */
export const AUVIK_DEVICE_TYPE_MAP: Record<string, NetworkDeviceType> = {
  accessPoint: 'access_point',
  switch: 'switch',
  l3Switch: 'switch',
  firewall: 'firewall',
  router: 'router',
  server: 'server',
  hypervisor: 'server',
}

export const AUVIK_STATUS_MAP: Record<string, NetworkDeviceStatus> = {
  up: 'online',
  online: 'online',
  down: 'offline',
  offline: 'offline',
  warning: 'warning',
  critical: 'critical',
  unknown: 'unknown',
}

export function mapAuvikDeviceType(raw: string | undefined): NetworkDeviceType | null {
  if (!raw) return null
  return AUVIK_DEVICE_TYPE_MAP[raw] ?? null
}

export function mapAuvikStatus(raw: string | undefined): NetworkDeviceStatus {
  if (!raw) return 'unknown'
  return AUVIK_STATUS_MAP[raw.toLowerCase()] ?? 'unknown'
}

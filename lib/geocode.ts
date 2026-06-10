/**
 * Address → lat/lng helper backed by OpenStreetMap Nominatim.
 *
 * Nominatim is free and requires:
 *   - A valid User-Agent identifying the app + a contact (per their usage policy:
 *     https://operations.osmfoundation.org/policies/nominatim/).
 *   - Max 1 request per second (the offices admin UI only geocodes on a manual
 *     button click, so we don't bother throttling here).
 *
 * Returns `null` on any failure (network, HTTP error, no results) so callers
 * can fall back to manual lat/lng entry without throwing.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'Bennett-Pless-EMS/1.0 (it@bennett-pless.com)'

export interface GeocodeResult {
  lat: number
  lon: number
}

export interface GeocodeAddress {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}

export function buildAddressQuery(parts: GeocodeAddress | string): string {
  if (typeof parts === 'string') return parts.trim()

  return [
    parts.address_line1,
    parts.address_line2,
    parts.city,
    parts.state,
    parts.postal_code,
    parts.country,
  ]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(', ')
}

/**
 * Fallback queries to try when the most-specific address doesn't return a hit.
 * Many US suburban office addresses aren't in OpenStreetMap's data, but the
 * city/zip almost always is — so dropping street first then country gives
 * useful office-level coordinates even when street-level fails.
 *
 * Returned in priority order; duplicates and the primary query are filtered
 * out by the caller.
 */
function buildFallbackQueries(parts: GeocodeAddress): string[] {
  return [
    buildAddressQuery({ ...parts, country: null }),
    buildAddressQuery({
      address_line1: null,
      address_line2: null,
      city: parts.city,
      state: parts.state,
      postal_code: parts.postal_code,
      country: parts.country,
    }),
    buildAddressQuery({
      address_line1: null,
      address_line2: null,
      city: parts.city,
      state: parts.state,
      postal_code: parts.postal_code,
      country: null,
    }),
    buildAddressQuery({
      address_line1: null,
      address_line2: null,
      city: parts.city,
      state: parts.state,
      postal_code: null,
      country: null,
    }),
  ]
}

export type GeocodePrecision = 'street' | 'city'

export interface GeocodeFailure {
  ok: false
  query: string
  reason: 'empty_query' | 'http_error' | 'no_results' | 'invalid_response' | 'fetch_failed'
  status?: number
  message?: string
}

export interface GeocodeSuccess extends GeocodeResult {
  ok: true
  query: string
  precision: GeocodePrecision
}

async function tryNominatim(
  query: string,
  precision: GeocodePrecision
): Promise<GeocodeSuccess | GeocodeFailure> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
  } catch (err) {
    return {
      ok: false,
      query,
      reason: 'fetch_failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (!res.ok) {
    return { ok: false, query, reason: 'http_error', status: res.status }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch (err) {
    return {
      ok: false,
      query,
      reason: 'invalid_response',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, query, reason: 'no_results' }
  }

  const first = data[0] as { lat?: string; lon?: string }
  const lat = Number(first.lat)
  const lon = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, query, reason: 'invalid_response' }
  }

  return { ok: true, query, lat, lon, precision }
}

/**
 * Detailed lookup that progressively falls back from street-level → city-level
 * when Nominatim can't resolve the full address (common for US suburban office
 * parks that aren't in OSM data).
 *
 * Tier 1: full address                        → precision: 'street'
 * Tier 2: full address minus country          → precision: 'street'
 * Tier 3: city + state + postal_code          → precision: 'city'
 * Tier 4: city + state + postal_code (no country) → precision: 'city'
 * Tier 5: city + state                        → precision: 'city'
 *
 * Each tier is only tried if the previous one returned `no_results` (other
 * failure reasons like `http_error` short-circuit immediately so we don't
 * hammer Nominatim during an outage).
 */
export async function geocodeAddressDetailed(
  query: GeocodeAddress | string
): Promise<GeocodeSuccess | GeocodeFailure> {
  const primary = buildAddressQuery(query)
  if (!primary) {
    return { ok: false, query: '', reason: 'empty_query' }
  }

  const first = await tryNominatim(primary, 'street')
  if (first.ok) return first
  if (first.reason !== 'no_results') return first

  if (typeof query !== 'object' || !query) return first

  const tried = new Set<string>([primary])
  const fallbacks = buildFallbackQueries(query)
    .filter((q) => q && !tried.has(q))

  let lastFailure: GeocodeFailure = first

  for (let i = 0; i < fallbacks.length; i++) {
    const q = fallbacks[i]
    if (tried.has(q)) continue
    tried.add(q)

    // First two fallbacks still target a street if address_line1 was present.
    // The rest are explicit city-only queries.
    const hasStreet = !!query.address_line1 && i < 1
    const precision: GeocodePrecision = hasStreet ? 'street' : 'city'

    const next = await tryNominatim(q, precision)
    if (next.ok) return next
    if (next.reason !== 'no_results') return next
    lastFailure = next
  }

  return lastFailure
}

export async function geocodeAddress(
  query: GeocodeAddress | string
): Promise<GeocodeResult | null> {
  const result = await geocodeAddressDetailed(query)
  return result.ok ? { lat: result.lat, lon: result.lon } : null
}

import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddressDetailed } from '@/lib/geocode'
import { isAdminRequest } from '@/lib/admin'

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as {
      address_line1?: string | null
      address_line2?: string | null
      city?: string | null
      state?: string | null
      postal_code?: string | null
      country?: string | null
      query?: string | null
    }

    const result = body.query
      ? await geocodeAddressDetailed(body.query)
      : await geocodeAddressDetailed({
          address_line1: body.address_line1 ?? null,
          address_line2: body.address_line2 ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          postal_code: body.postal_code ?? null,
          country: body.country ?? null,
        })

    if (result.ok) {
      console.log('[geocode] OK', {
        query: result.query,
        precision: result.precision,
        lat: result.lat,
        lon: result.lon,
      })
      return NextResponse.json({
        lat: result.lat,
        lon: result.lon,
        query: result.query,
        precision: result.precision,
      })
    }

    console.warn('[geocode] failed', result)

    const reasonToMessage: Record<typeof result.reason, string> = {
      empty_query: 'Address is empty — fill in at least one field before geocoding.',
      no_results: `No results found for "${result.query}". Try simplifying the address (street + city is usually enough), or enter lat/lng manually.`,
      http_error: `Nominatim returned HTTP ${result.status ?? 'error'}.`,
      invalid_response: 'Nominatim returned an unexpected response.',
      fetch_failed: `Could not reach Nominatim${result.message ? ` (${result.message})` : ''}.`,
    }

    return NextResponse.json(
      {
        error: reasonToMessage[result.reason],
        reason: result.reason,
        query: result.query,
        status: result.status,
      },
      { status: result.reason === 'no_results' ? 404 : 502 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Geocoding failed'
    console.error('Geocode error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

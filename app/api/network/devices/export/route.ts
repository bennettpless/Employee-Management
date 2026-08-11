import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import {
  buildDevicesCsv,
  slugForFilename,
  todayStamp,
  type NetworkDeviceExportRow,
} from '@/lib/network-export'

const SUPPORTED_FORMATS = new Set(['csv'])

/**
 * GET /api/network/devices/export?format=csv&officeId=<uuid?>
 *
 * Returns the network device inventory as a downloadable CSV. When
 * `officeId` is provided, only that office's devices are included.
 * Auth is handled by the global middleware — any authenticated user can
 * export (matches read access on the underlying tables).
 */
export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams
    const format = (params.get('format') ?? 'csv').toLowerCase()
    const officeId = params.get('officeId') ?? params.get('office_id')

    if (!SUPPORTED_FORMATS.has(format)) {
      return NextResponse.json(
        { error: `Unsupported format "${format}". Supported: csv` },
        { status: 400 }
      )
    }

    const supabase = getServiceSupabase()

    let query = supabase
      .from('network_devices')
      .select('*, office:offices(id, name)')
      // Group rows by office in the file so a human reading the CSV sees
      // one office's devices together instead of an interleaved list.
      .order('office_id', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })

    let officeName: string | null = null

    if (officeId) {
      query = query.eq('office_id', officeId)
      const { data: office, error: officeErr } = await supabase
        .from('offices')
        .select('name')
        .eq('id', officeId)
        .maybeSingle()
      if (officeErr) throw officeErr
      if (!office) {
        return NextResponse.json({ error: 'Office not found' }, { status: 404 })
      }
      officeName = office.name
    }

    const { data: devices, error } = await query
    if (error) throw error

    const rows = (devices ?? []) as NetworkDeviceExportRow[]
    const csv = buildDevicesCsv(rows)

    const slug = officeName ? slugForFilename(officeName) : 'all-offices'
    const filename = `network-devices-${slug}-${todayStamp()}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to export network devices'
    console.error('Error exporting network devices:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

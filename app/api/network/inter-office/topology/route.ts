import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin'

/**
 * Inter-office topology persistence.
 *
 * The inter-office React Flow canvas (see components/temp-topology/InterOfficeMap.tsx)
 * shows one node per office and one edge per site-to-site link (SonicWall VPN,
 * Cloud Secure Edge, MPLS, etc.). Node positions live on `offices.layout_x/_y`
 * (matches the per-office device topology pattern) and edges live in
 * `office_connections`.
 *
 * We expose ONE payload shape here — `{ positions, links }` — because the
 * client always loads and saves the two together. Splitting them across
 * endpoints would just force the client to interleave requests and reason
 * about partial-save failures for what is fundamentally a single canvas
 * document.
 */

export interface InterOfficeLinkPayload {
    id?: string
    source: string
    target: string
    linkType: string
    sourceHandle?: string | null
    targetHandle?: string | null
    curveOffset?: number | null
}

interface OfficeRow {
    id: string
    layout_x: number | string | null
    layout_y: number | string | null
}

interface ConnectionRow {
    id: string
    source_office_id: string
    target_office_id: string
    link_type: string
    source_handle: string | null
    target_handle: string | null
    curve_offset: number | string | null
}

function toNumber(value: number | string | null): number | null {
    if (value == null) return null
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : null
}

/**
 * GET /api/network/inter-office/topology
 *
 * Returns the full inter-office canvas state:
 *   {
 *     positions: { [officeId]: { x, y } },
 *     links:     InterOfficeLinkPayload[]
 *   }
 *
 * Offices with NULL layout coordinates are omitted from `positions` so the
 * client's auto-layout still runs for freshly-added offices.
 */
export async function GET() {
    try {
        const supabase = getServiceSupabase()

        const [officesResult, connectionsResult] = await Promise.all([
            supabase
                .from('offices')
                .select('id, layout_x, layout_y'),
            supabase
                .from('office_connections')
                .select('*'),
        ])

        if (officesResult.error) throw officesResult.error
        if (connectionsResult.error) throw connectionsResult.error

        const positions: Record<string, { x: number; y: number }> = {}
        for (const office of (officesResult.data ?? []) as OfficeRow[]) {
            const x = toNumber(office.layout_x)
            const y = toNumber(office.layout_y)
            if (x !== null && y !== null) {
                positions[office.id] = { x, y }
            }
        }

        const links: InterOfficeLinkPayload[] = (
            (connectionsResult.data ?? []) as ConnectionRow[]
        ).map((row) => ({
            id: row.id,
            source: row.source_office_id,
            target: row.target_office_id,
            linkType: row.link_type,
            sourceHandle: row.source_handle,
            targetHandle: row.target_handle,
            curveOffset: toNumber(row.curve_offset),
        }))

        return NextResponse.json({ positions, links })
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : 'Failed to fetch inter-office topology'
        console.error('Error fetching inter-office topology:', error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

interface SaveBody {
    positions?: Record<string, unknown>
    links?: unknown[]
}

interface ParsedLink {
    source_office_id: string
    target_office_id: string
    link_type: string
    source_handle: string | null
    target_handle: string | null
    curve_offset: number | null
}

function parseLink(raw: unknown, officeIds: Set<string>): ParsedLink | null {
    if (!raw || typeof raw !== 'object') return null
    const obj = raw as Record<string, unknown>

    const source = obj.source
    const target = obj.target
    if (typeof source !== 'string' || typeof target !== 'string') return null
    if (source === target) return null
    if (!officeIds.has(source) || !officeIds.has(target)) return null

    const linkTypeRaw = typeof obj.linkType === 'string' ? obj.linkType.trim() : ''
    const linkType = linkTypeRaw.length > 0 ? linkTypeRaw.slice(0, 100) : 'Link'

    const sourceHandle =
        typeof obj.sourceHandle === 'string' && obj.sourceHandle.length > 0
            ? obj.sourceHandle.slice(0, 10)
            : null
    const targetHandle =
        typeof obj.targetHandle === 'string' && obj.targetHandle.length > 0
            ? obj.targetHandle.slice(0, 10)
            : null

    let curveOffset: number | null = null
    if (typeof obj.curveOffset === 'number' && Number.isFinite(obj.curveOffset)) {
        curveOffset = obj.curveOffset
    }

    return {
        source_office_id: source,
        target_office_id: target,
        link_type: linkType,
        source_handle: sourceHandle,
        target_handle: targetHandle,
        curve_offset: curveOffset,
    }
}

/**
 * PUT /api/network/inter-office/topology
 *
 * Atomically replace the inter-office canvas state.
 *
 * Body:
 *   {
 *     positions?: { [officeId]: { x: number, y: number } },
 *     links?: Array<{
 *       source: string,
 *       target: string,
 *       linkType: string,
 *       sourceHandle?: string | null,
 *       targetHandle?: string | null,
 *       curveOffset?: number | null,
 *     }>
 *   }
 *
 * Implementation notes:
 *  - We do a full delete-then-insert on `office_connections`. The dataset is
 *    <100 rows, only one operator edits at a time (there is no locking), and
 *    replace-all keeps the server logic simple + provably correct. If two
 *    admins ever save concurrently, last-write-wins.
 *  - Any link whose source or target office no longer exists in `offices` is
 *    silently dropped so a stale client can't crash the save.
 *  - Positions are individually UPDATEd (no delete) so unrelated columns on
 *    the `offices` row are untouched.
 *
 * Admin-only, matching every other network write endpoint.
 */
export async function PUT(request: NextRequest) {
    try {
        if (!(await isAdminRequest())) {
            return NextResponse.json(
                { error: 'Admin role required' },
                { status: 403 }
            )
        }

        const body = (await request.json()) as SaveBody
        const rawPositions = body.positions ?? {}
        const rawLinks = Array.isArray(body.links) ? body.links : []

        const supabase = getServiceSupabase()

        // Load current office ids so we can validate every reference before
        // touching either table. This also gives us the set of positions we're
        // allowed to update.
        const { data: officeRows, error: officesError } = await supabase
            .from('offices')
            .select('id')
        if (officesError) throw officesError
        const officeIds = new Set(
            ((officeRows ?? []) as Array<{ id: string }>).map((o) => o.id)
        )

        const parsedLinks: ParsedLink[] = []
        for (const raw of rawLinks) {
            const parsed = parseLink(raw, officeIds)
            if (parsed) parsedLinks.push(parsed)
        }

        // 1. Replace connections. Delete-all-then-insert is the simplest
        // correct pattern for a small canvas doc.
        const { error: deleteError } = await supabase
            .from('office_connections')
            // Supabase requires a filter on delete; match every row.
            .delete()
            .not('id', 'is', null)
        if (deleteError) throw deleteError

        if (parsedLinks.length > 0) {
            const { error: insertError } = await supabase
                .from('office_connections')
                .insert(parsedLinks)
            if (insertError) throw insertError
        }

        // 2. Persist positions. Only touch offices whose id is in the payload
        // AND still exists in the DB. Ignore malformed entries silently — one
        // bad coordinate shouldn't fail the whole save.
        const positionUpdates: Array<{
            id: string
            layout_x: number
            layout_y: number
        }> = []
        if (rawPositions && typeof rawPositions === 'object') {
            for (const [officeId, coord] of Object.entries(rawPositions)) {
                if (!officeIds.has(officeId)) continue
                if (!coord || typeof coord !== 'object') continue
                const c = coord as Record<string, unknown>
                const x = typeof c.x === 'number' ? c.x : Number(c.x)
                const y = typeof c.y === 'number' ? c.y : Number(c.y)
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue
                positionUpdates.push({
                    id: officeId,
                    layout_x: Math.round(x),
                    layout_y: Math.round(y),
                })
            }
        }

        if (positionUpdates.length > 0) {
            const results = await Promise.all(
                positionUpdates.map((u) =>
                    supabase
                        .from('offices')
                        .update({ layout_x: u.layout_x, layout_y: u.layout_y })
                        .eq('id', u.id)
                )
            )
            const failed = results.find((r) => r.error)
            if (failed?.error) throw failed.error
        }

        // Return the fresh state so the client can rebind edge ids (React
        // Flow keys on `id`; because we replace-all, rows come back with new
        // UUIDs).
        const { data: newConnections, error: reloadError } = await supabase
            .from('office_connections')
            .select('*')
        if (reloadError) throw reloadError

        const links: InterOfficeLinkPayload[] = (
            (newConnections ?? []) as ConnectionRow[]
        ).map((row) => ({
            id: row.id,
            source: row.source_office_id,
            target: row.target_office_id,
            linkType: row.link_type,
            sourceHandle: row.source_handle,
            targetHandle: row.target_handle,
            curveOffset: toNumber(row.curve_offset),
        }))

        return NextResponse.json({
            saved: {
                connections: links.length,
                positions: positionUpdates.length,
            },
            links,
        })
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : 'Failed to save inter-office topology'
        console.error('Error saving inter-office topology:', error)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

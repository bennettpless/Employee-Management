/**
 * Inter-office topology persistence client.
 *
 * Backs the `/network/inter-office` React Flow canvas. Node positions and
 * inter-office links are stored server-side (see
 * `supabase/migrations/10_office_connections.sql` and
 * `app/api/network/inter-office/topology/route.ts`) so the map survives cache
 * clears, browser changes, and multi-user access.
 *
 * Historical note: this module used to persist to `localStorage` under the key
 * `temp-topology:inter-office:v1`. That data has been migrated into the
 * `office_connections` table and `offices.layout_x/_y` columns; the browser
 * key is intentionally left untouched in case anyone needs to recover an
 * older snapshot manually.
 */

export interface InterOfficeLink {
    /** Server-assigned UUID once the link is persisted. Optional locally for
     * links the operator just drew — the API assigns an id on save. */
    id: string
    /** source office id (matches `offices.id`) */
    source: string
    /** target office id (matches `offices.id`) */
    target: string
    /** free-text link label, e.g. "IPSec VPN", "Cloud Secure Edge", "MPLS" */
    linkType: string
    /** React Flow handle ids captured at draw time so edge routing survives reloads */
    sourceHandle?: string
    targetHandle?: string
    /**
     * Manual bend amount: signed perpendicular distance (in canvas units) of
     * the arc's apex from the straight line between the two offices. 0 /
     * undefined = straight line. Set by dragging the link's midpoint handle.
     */
    curveOffset?: number
}

export interface InterOfficeMapState {
    /** officeId -> canvas position (only offices with saved positions are
     * present; new offices get an auto-layout on the client). */
    positions: Record<string, { x: number; y: number }>
    links: InterOfficeLink[]
}

interface TopologyResponse {
    positions?: Record<string, { x: number; y: number }>
    links?: Array<{
        id: string
        source: string
        target: string
        linkType: string
        sourceHandle?: string | null
        targetHandle?: string | null
        curveOffset?: number | null
    }>
    error?: string
}

interface SaveResponse {
    saved?: { connections: number; positions: number }
    links?: TopologyResponse['links']
    error?: string
}

function normalizeLinks(raw: TopologyResponse['links']): InterOfficeLink[] {
    if (!Array.isArray(raw)) return []
    return raw.map((l) => ({
        id: l.id,
        source: l.source,
        target: l.target,
        linkType: l.linkType,
        sourceHandle: l.sourceHandle ?? undefined,
        targetHandle: l.targetHandle ?? undefined,
        curveOffset:
            typeof l.curveOffset === 'number' && Number.isFinite(l.curveOffset)
                ? l.curveOffset
                : undefined,
    }))
}

/**
 * Load the persisted inter-office topology (positions + links) from the API.
 * Returns an empty-but-valid state on failure so the map still mounts and the
 * caller can surface a retry.
 */
export async function fetchState(): Promise<InterOfficeMapState> {
    try {
        const res = await fetch('/api/network/inter-office/topology', {
            cache: 'no-store',
        })
        const data = (await res.json()) as TopologyResponse
        if (!res.ok) {
            throw new Error(data.error || 'Failed to load inter-office topology')
        }
        return {
            positions:
                data.positions && typeof data.positions === 'object'
                    ? data.positions
                    : {},
            links: normalizeLinks(data.links),
        }
    } catch (err) {
        console.error('fetchState (inter-office topology) failed:', err)
        return { positions: {}, links: [] }
    }
}

/**
 * Atomically replace the persisted topology with the caller's state. Returns
 * the server-canonical links (with fresh UUIDs — save is delete-then-insert
 * server-side) so the client can rebind React Flow edge ids after the save.
 */
export async function saveState(
    state: InterOfficeMapState
): Promise<InterOfficeLink[] | null> {
    try {
        const res = await fetch('/api/network/inter-office/topology', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                positions: state.positions,
                links: state.links.map((l) => ({
                    source: l.source,
                    target: l.target,
                    linkType: l.linkType,
                    sourceHandle: l.sourceHandle ?? null,
                    targetHandle: l.targetHandle ?? null,
                    curveOffset:
                        typeof l.curveOffset === 'number'
                            ? l.curveOffset
                            : null,
                })),
            }),
        })
        const data = (await res.json()) as SaveResponse
        if (!res.ok) {
            throw new Error(data.error || 'Failed to save inter-office topology')
        }
        return normalizeLinks(data.links)
    } catch (err) {
        console.error('saveState (inter-office topology) failed:', err)
        return null
    }
}

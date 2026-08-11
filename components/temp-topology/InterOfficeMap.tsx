'use client'

/**
 * Company-wide inter-office topology editor. Office nodes come from the real
 * `offices` table; the links between them (site-to-site SonicWall VPN / Cloud
 * Secure Edge / MPLS, entered by hand) and the node layout are persisted
 * server-side via `/api/network/inter-office/topology` (see
 * `office_connections` + `offices.layout_x/_y`). Export the finished map to
 * PNG or PDF.
 *
 * Mirrors the proven patterns in `components/network/OfficeTopology.tsx`
 * (React Flow toolbar + html-to-image / jsPDF export).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  ConnectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type EdgeMouseHandler,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import {
  Loader2,
  LayoutGrid,
  RefreshCw,
  Share2,
  Trash2,
  AlertCircle,
  Building2,
  Eye,
  EyeOff,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import OfficeMapNode from '@/components/temp-topology/OfficeMapNode'
import FloatingEdge from '@/components/temp-topology/FloatingEdge'
import ExportMenu from '@/components/network/ExportMenu'
import {
  fetchState,
  saveState,
  type InterOfficeLink,
} from '@/lib/temp-topology/storage'

interface OfficeApiRow {
  id: string
  name: string
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  device_count?: number
}

const nodeTypes: NodeTypes = {
  officeNode: OfficeMapNode,
}

const edgeTypes: EdgeTypes = {
  floating: FloatingEdge,
}

/** Colour the link by its (free-text) type so the export reads at a glance. */
function linkStyle(linkType: string): { stroke: string; strokeWidth: number } {
  const key = linkType.toLowerCase()
  const stroke =
    key.includes('secure edge') || key.includes('cse')
      ? '#7c3aed'
      : key.includes('mpls')
        ? '#16a34a'
        : key.includes('internet') || key.includes('sd-wan') || key.includes('sdwan')
          ? '#ea580c'
          : key.includes('vpn') || key.includes('ipsec')
            ? '#2563eb'
            : '#6b7280'
  return { stroke, strokeWidth: 2.5 }
}

function linkToEdge(l: InterOfficeLink): Edge {
  const base = linkStyle(l.linkType)
  return {
    id: l.id,
    source: l.source,
    target: l.target,
    sourceHandle: l.sourceHandle ?? undefined,
    targetHandle: l.targetHandle ?? undefined,
    // Floating edges connect office-to-office at the nearest border, so the
    // lines stay clean after auto-layout. Type is conveyed by colour + legend
    // rather than a label on every line (which got noisy with 20+ links).
    type: 'floating',
    animated: false,
    style: {
      stroke: base.stroke,
      strokeWidth: base.strokeWidth,
      strokeOpacity: 0.7,
      strokeLinecap: 'round' as const,
    },
    data: { link: l },
  }
}

type Positioned = Record<string, { x: number; y: number }>
type LinkLike = { source: string; target: string }
type GeoOffice = {
  id: string
  latitude: number | null
  longitude: number | null
}

/** Count how many links touch each office (incident-edge degree). */
function degreeMap(links: LinkLike[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of links) {
    m.set(l.source, (m.get(l.source) ?? 0) + 1)
    m.set(l.target, (m.get(l.target) ?? 0) + 1)
  }
  return m
}

/** Circular mean of a set of angles (radians, normalized to [0, 2π)). */
function meanAngle(angles: number[]): number {
  if (!angles.length) return 0
  let s = 0
  let c = 0
  for (const a of angles) {
    s += Math.sin(a)
    c += Math.cos(a)
  }
  const m = Math.atan2(s / angles.length, c / angles.length)
  return m < 0 ? m + 2 * Math.PI : m
}

/**
 * Order the ring (non-hub) offices so that densely interconnected offices stay
 * next to each other instead of being scattered by raw geography. We:
 *   1. Build adjacency from ring-internal links only (hub edges ignored — they
 *      all converge on the center and never cross each other).
 *   2. Split the ring into connected components ("regional meshes").
 *   3. Greedily seriate each component so adjacent offices in the sequence are
 *      actually linked, which turns long mesh chords into short neighbor hops.
 *   4. Place the components around the ring ordered by their average geographic
 *      bearing, so the overall arrangement still reads roughly like a map.
 */
function orderRingByClusters(
  ring: GeoOffice[],
  links: LinkLike[],
  bearingOf: (o: GeoOffice) => number
): GeoOffice[] {
  if (ring.length <= 2) {
    return [...ring].sort((a, b) => bearingOf(a) - bearingOf(b))
  }

  const ids = new Set(ring.map((o) => o.id))
  const byId = new Map(ring.map((o) => [o.id, o] as const))
  const adj = new Map<string, Set<string>>()
  ring.forEach((o) => adj.set(o.id, new Set<string>()))
  for (const l of links) {
    if (l.source !== l.target && ids.has(l.source) && ids.has(l.target)) {
      adj.get(l.source)!.add(l.target)
      adj.get(l.target)!.add(l.source)
    }
  }
  const deg = (id: string) => adj.get(id)!.size

  // Discover connected components in bearing order so output is deterministic.
  const ringByBearing = [...ring].sort((a, b) => bearingOf(a) - bearingOf(b))
  const visited = new Set<string>()
  const comps: string[][] = []
  for (const seed of ringByBearing) {
    if (visited.has(seed.id)) continue
    const comp: string[] = []
    const stack = [seed.id]
    visited.add(seed.id)
    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const nb of adj.get(cur)!) {
        if (!visited.has(nb)) {
          visited.add(nb)
          stack.push(nb)
        }
      }
    }
    comps.push(comp)
  }

  // Greedy seriation: start at the most-connected office, then repeatedly append
  // whichever remaining office is linked to the last-placed one (preferring ones
  // with the most already-placed neighbours), keeping the chain tight.
  const seriate = (comp: string[]): string[] => {
    if (comp.length <= 2) {
      return [...comp].sort(
        (a, b) => bearingOf(byId.get(a)!) - bearingOf(byId.get(b)!)
      )
    }
    const remaining = new Set(comp)
    let start = comp[0]
    for (const id of comp) {
      if (
        deg(id) > deg(start) ||
        (deg(id) === deg(start) &&
          bearingOf(byId.get(id)!) < bearingOf(byId.get(start)!))
      ) {
        start = id
      }
    }
    const order = [start]
    remaining.delete(start)
    while (remaining.size) {
      const last = order[order.length - 1]
      const lastBearing = bearingOf(byId.get(last)!)
      let pick: string | null = null
      let pickScore = -Infinity
      for (const c of remaining) {
        const adjacentToLast = adj.get(last)!.has(c) ? 1 : 0
        let placedNeighbors = 0
        for (const o of order) if (adj.get(c)!.has(o)) placedNeighbors++
        const score = adjacentToLast * 1000 + placedNeighbors * 10 + deg(c)
        const closer =
          pick !== null &&
          Math.abs(bearingOf(byId.get(c)!) - lastBearing) <
            Math.abs(bearingOf(byId.get(pick)!) - lastBearing)
        if (score > pickScore || (score === pickScore && closer)) {
          pickScore = score
          pick = c
        }
      }
      order.push(pick!)
      remaining.delete(pick!)
    }
    return order
  }

  return comps
    .map((comp) => ({
      order: seriate(comp),
      mean: meanAngle(comp.map((id) => bearingOf(byId.get(id)!))),
    }))
    .sort((a, b) => a.mean - b.mean)
    .flatMap((c) => c.order)
    .map((id) => byId.get(id)!)
}

const CANVAS_CENTER = { x: 780, y: 470 }

/**
 * Industry-standard WAN layout: the most-connected office becomes a central
 * hub, and the rest are arranged on a ring around it ordered by their true
 * geographic bearing from the hub (so western offices sit left, northern up,
 * etc.) but spaced evenly so nodes never overlap. When no office qualifies as a
 * hub, every office is placed on the ring ordered by bearing from the centroid.
 */
function computeHubGeoLayout(
  offices: GeoOffice[],
  links: LinkLike[]
): Positioned {
  const n = offices.length
  const { x: cx, y: cy } = CANVAS_CENTER
  const out: Positioned = {}
  if (n === 0) return out
  if (n === 1) {
    out[offices[0].id] = { x: cx, y: cy }
    return out
  }

  const deg = degreeMap(links)
  let hub: GeoOffice | null = null
  let hubDeg = -1
  for (const o of offices) {
    const dg = deg.get(o.id) ?? 0
    if (dg > hubDeg) {
      hubDeg = dg
      hub = o
    }
  }
  const useHub = !!hub && hubDeg >= Math.max(3, Math.ceil((n - 1) / 2))

  // Reference point for bearings: the hub if we have one, else the centroid of
  // all offices that have coordinates.
  const finite = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v)
  const coordOffices = offices.filter((o) => finite(o.latitude) && finite(o.longitude))
  const avgLat =
    coordOffices.reduce((s, o) => s + (o.latitude as number), 0) /
    (coordOffices.length || 1)
  const avgLng =
    coordOffices.reduce((s, o) => s + (o.longitude as number), 0) /
    (coordOffices.length || 1)
  const refLat = useHub && finite(hub!.latitude) ? (hub!.latitude as number) : avgLat
  const refLng = useHub && finite(hub!.longitude) ? (hub!.longitude as number) : avgLng

  const ring = useHub ? offices.filter((o) => o.id !== hub!.id) : offices.slice()

  // Bearing on screen: east = +x, north = -y (so dirY is south-positive),
  // normalized to [0, 2π).
  const bearingOf = (o: GeoOffice): number => {
    const lat = finite(o.latitude) ? (o.latitude as number) : refLat
    const lng = finite(o.longitude) ? (o.longitude as number) : refLng
    const dirX = lng - refLng
    const dirY = refLat - lat
    if (dirX === 0 && dirY === 0) return 0
    const a = Math.atan2(dirY, dirX)
    return a < 0 ? a + 2 * Math.PI : a
  }

  // Keep interconnected offices adjacent on the ring, then arrange clusters
  // around the circle in roughly geographic order.
  const ordered = orderRingByClusters(ring, links, bearingOf)

  const radius = Math.max(320, ring.length * 44)
  if (useHub) out[hub!.id] = { x: cx, y: cy }
  const startAngle = ordered.length ? bearingOf(ordered[0]) : -Math.PI / 2
  ordered.forEach((o, i) => {
    const a = startAngle + (2 * Math.PI * i) / ordered.length
    out[o.id] = {
      x: Math.round(cx + radius * Math.cos(a)),
      y: Math.round(cy + radius * Math.sin(a)),
    }
  })
  return out
}

function InterOfficeMapInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null)
  const [officeCount, setOfficeCount] = useState(0)
  // Tracks in-flight PUTs to /api/network/inter-office/topology so the header
  // can show a "Saving…" hint. Purely informational — the debounced save loop
  // runs regardless.
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // When true, links touching the hub office are hidden from view (and exports)
  // to declutter the centre — the hub's connectivity is implied by its position.
  const [hideHubLinks, setHideHubLinks] = useState(false)

  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null)
  // Guards the persistence effect so we don't overwrite saved state with empty
  // arrays during the initial render before offices have loaded.
  const hasLoadedRef = useRef(false)
  // Office coordinates kept around so "Auto-layout" can recompute the geographic
  // hub-and-spoke arrangement without re-fetching.
  const officesRef = useRef<GeoOffice[]>([])

  const router = useRouter()
  // Clicking an office opens its per-office device map (the DB-backed office
  // detail page with the device topology diagram).
  const openOfficeMap = useCallback(
    (officeId: string) => {
      router.push(`/network/offices/${officeId}`)
    },
    [router]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    hasLoadedRef.current = false
    try {
      // Fetch offices + persisted topology in parallel — they're independent
      // and both required before we can build the React Flow state.
      const [officesRes, saved] = await Promise.all([
        fetch('/api/network/offices'),
        fetchState(),
      ])
      const officesData = (await officesRes.json()) as {
        offices?: OfficeApiRow[]
        error?: string
      }
      if (!officesRes.ok) {
        throw new Error(officesData.error || 'Failed to load offices')
      }

      const offices = officesData.offices ?? []
      setOfficeCount(offices.length)

      const idSet = new Set(offices.map((o) => o.id))

      // Drop any saved links whose endpoints no longer exist (office deleted).
      // The server enforces this too via ON DELETE CASCADE, but filtering
      // client-side keeps the diagram from momentarily showing dangling edges.
      const validLinks = saved.links.filter(
        (l) => idSet.has(l.source) && idSet.has(l.target)
      )

      const geoOffices: GeoOffice[] = offices.map((o) => ({
        id: o.id,
        latitude: o.latitude,
        longitude: o.longitude,
      }))
      officesRef.current = geoOffices
      const auto = computeHubGeoLayout(geoOffices, validLinks)

      const flowNodes: Node[] = offices.map((o) => ({
        id: o.id,
        type: 'officeNode',
        position: saved.positions[o.id] ?? auto[o.id] ?? CANVAS_CENTER,
        data: {
          officeId: o.id,
          name: o.name,
          subtitle: [o.city, o.state].filter(Boolean).join(', '),
          deviceCount: o.device_count,
        },
      }))

      setNodes(flowNodes)
      setEdges(validLinks.map(linkToEdge))
      hasLoadedRef.current = true
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load topology')
    } finally {
      setLoading(false)
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    load()
  }, [load])

  // Persist layout + links to the server (debounced) whenever the diagram
  // changes. React Flow fires nodesChange on every drag tick, so the 400ms
  // debounce keeps us from hammering the API mid-drag while still saving
  // promptly once the user pauses.
  useEffect(() => {
    if (!hasLoadedRef.current) return
    const t = window.setTimeout(async () => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) {
        positions[n.id] = {
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        }
      }
      const links = edges
        .map((e) => (e.data as { link?: InterOfficeLink } | undefined)?.link)
        .filter((l): l is InterOfficeLink => Boolean(l))
      setSaving(true)
      try {
        const savedLinks = await saveState({ positions, links })
        if (savedLinks === null) {
          setSaveError('Failed to save changes — see console')
        } else {
          setSaveError(null)
        }
      } finally {
        setSaving(false)
      }
    }, 400)
    return () => window.clearTimeout(t)
  }, [nodes, edges])

  // Keep each node's link count + hub flag in sync with the current edges.
  useEffect(() => {
    if (!hasLoadedRef.current) return
    const deg = degreeMap(edges.map((e) => ({ source: e.source, target: e.target })))
    setNodes((curr) => {
      let hubId: string | null = null
      let hubDeg = -1
      for (const nd of curr) {
        const dg = deg.get(nd.id) ?? 0
        if (dg > hubDeg) {
          hubDeg = dg
          hubId = nd.id
        }
      }
      const useHub = hubDeg >= Math.max(3, Math.ceil((curr.length - 1) / 2))
      return curr.map((nd) => ({
        ...nd,
        data: {
          ...nd.data,
          connectionCount: deg.get(nd.id) ?? 0,
          isHub: useHub && nd.id === hubId,
        },
      }))
    })
  }, [edges, setNodes])

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      if (params.source === params.target) {
        setActionError('An office cannot link to itself')
        return
      }
      const entered = window.prompt(
        'Link type (e.g. IPSec VPN, Cloud Secure Edge, MPLS, Internet):',
        'IPSec VPN'
      )
      if (entered === null) return
      const linkType = entered.trim() || 'Link'
      const link: InterOfficeLink = {
        id: `link-${params.source}-${params.target}-${Date.now()}`,
        source: params.source,
        target: params.target,
        linkType,
        sourceHandle: params.sourceHandle ?? undefined,
        targetHandle: params.targetHandle ?? undefined,
      }
      setActionError(null)
      setEdges((eds) => addEdge(linkToEdge(link), eds))
    },
    [setEdges]
  )

  const handleEdgeContextMenu = useCallback<EdgeMouseHandler>(
    (event, edge) => {
      event.preventDefault()
      if (!confirm('Delete this link?')) return
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    },
    [setEdges]
  )

  const handleAutoLayout = useCallback(() => {
    setActionError(null)
    const links = edges.map((e) => ({ source: e.source, target: e.target }))
    const auto = computeHubGeoLayout(officesRef.current, links)
    setNodes((curr) =>
      curr.map((n) => ({ ...n, position: auto[n.id] ?? n.position }))
    )
  }, [edges, setNodes])

  const handleClearLinks = useCallback(() => {
    if (edges.length === 0) return
    if (!confirm(`Delete all ${edges.length} link(s)? This cannot be undone.`))
      return
    setEdges([])
  }, [edges.length, setEdges])

  const exportImage = useCallback(async (kind: 'png' | 'pdf') => {
    if (!reactFlowWrapperRef.current) return
    setExporting(kind)
    setActionError(null)
    try {
      const dataUrl = await toPng(reactFlowWrapperRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          if (node.classList?.contains('react-flow__minimap')) return false
          if (node.classList?.contains('react-flow__controls')) return false
          if (node.classList?.contains('react-flow__attribution')) return false
          return true
        },
      })

      if (kind === 'png') {
        const link = document.createElement('a')
        link.download = 'inter-office-topology.png'
        link.href = dataUrl
        link.click()
        return
      }

      const pdf = new jsPDF({ orientation: 'landscape' })
      const props = pdf.getImageProperties(dataUrl)
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const scale = Math.min(pageWidth / props.width, pageHeight / props.height)
      const w = props.width * scale
      const h = props.height * scale
      pdf.addImage(
        dataUrl,
        'PNG',
        (pageWidth - w) / 2,
        (pageHeight - h) / 2,
        w,
        h
      )
      pdf.save('inter-office-topology.pdf')
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Failed to export ${kind.toUpperCase()}`
      )
    } finally {
      setExporting(null)
    }
  }, [])

  const legendItems = useMemo(() => {
    const types = new Map<string, string>()
    for (const e of edges) {
      const lt = (e.data as { link?: InterOfficeLink } | undefined)?.link?.linkType
      if (lt && !types.has(lt)) types.set(lt, linkStyle(lt).stroke)
    }
    return Array.from(types.entries()).map(([label, color]) => ({ label, color }))
  }, [edges])

  const hub = useMemo(() => {
    const n = nodes.find((nd) => (nd.data as { isHub?: boolean })?.isHub)
    return n ? { id: n.id, name: (n.data as { name?: string })?.name ?? 'Hub' } : null
  }, [nodes])
  const hasHub = hub !== null

  const officeOptions = useMemo(
    () =>
      nodes
        .map((n) => ({ id: n.id, name: (n.data as { name?: string })?.name ?? n.id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [nodes]
  )

  // What React Flow actually renders: optionally hide the hub's spokes to
  // declutter the centre. Links stay in `edges` (and storage) regardless.
  const displayEdges = useMemo(() => {
    if (!hideHubLinks || !hub) return edges
    return edges.map((e) =>
      e.source === hub.id || e.target === hub.id ? { ...e, hidden: true } : e
    )
  }, [edges, hideHubLinks, hub])

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-start gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Failed to load offices</p>
            <p className="text-sm">{loadError}</p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (officeCount === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-12 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 mb-1">No offices yet.</p>
        <p className="text-sm text-gray-500 mb-3">
          Add your offices first, then come back to draw the links between them.
        </p>
        <Link
          href="/settings/offices"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          Manage offices
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200 flex-wrap">
        <div className="flex items-center gap-2 text-gray-700">
          <Share2 className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold">Inter-Office Topology</h3>
          <span className="text-sm text-gray-500">
            ({nodes.length} office{nodes.length === 1 ? '' : 's'}, {edges.length}{' '}
            link{edges.length === 1 ? '' : 's'})
          </span>
          {saving && (
            <span
              className="inline-flex items-center gap-1 text-xs text-gray-500"
              title="Saving changes to the database"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) openOfficeMap(e.target.value)
            }}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 max-w-[180px]"
            title="Open an office's device map"
          >
            <option value="">Open office map…</option>
            {officeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAutoLayout}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Arrange offices in a circle"
          >
            <LayoutGrid className="w-4 h-4" />
            Auto-layout
          </button>
          <button
            onClick={handleClearLinks}
            disabled={edges.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Remove every link"
          >
            <Trash2 className="w-4 h-4" />
            Clear links
          </button>
          {hasHub && (
            <button
              onClick={() => setHideHubLinks((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title={
                hideHubLinks
                  ? `Show the links from ${hub?.name ?? 'the hub'} to every office`
                  : `Hide the ${hub?.name ?? 'hub'} spokes to declutter the centre`
              }
            >
              {hideHubLinks ? (
                <Eye className="w-4 h-4" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              {hideHubLinks ? 'Show hub links' : 'Hide hub links'}
            </button>
          )}
          <ExportMenu
            label="Export"
            items={[
              {
                format: 'png',
                onSelect: () => exportImage('png'),
                running: exporting === 'png',
              },
              {
                format: 'pdf',
                onSelect: () => exportImage('pdf'),
                running: exporting === 'pdf',
              },
            ]}
          />
        </div>
      </div>

      {actionError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5" />
        Click an office to open its device map. Drag from one office to another
        to add a link (you'll be asked for the link type). Click a link, then
        drag the dot to bend it (double-click the dot to straighten). Right-click
        a link to delete it. Layout and links are saved to the database — every
        admin sees the same map.
      </div>

      {saveError && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{saveError}</span>
          <button
            onClick={() => setSaveError(null)}
            className="text-amber-800 hover:text-amber-900 underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      <div ref={reactFlowWrapperRef} style={{ width: '100%', height: '640px' }}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeClick={(_e, node) => openOfficeMap(node.id)}
          onEdgeContextMenu={handleEdgeContextMenu}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
          <Panel position="top-left">
            <div className="bg-white/95 border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-[11px] text-gray-700 space-y-1">
              <div className="font-semibold text-gray-800 mb-1">Legend</div>
              {hasHub && (
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
                  Hub office (most links)
                </div>
              )}
              {hasHub && hideHubLinks && (
                <div className="text-[10px] text-gray-500 max-w-[170px] leading-snug">
                  {hub?.name ?? 'Hub'} connects to all offices (spokes hidden for
                  clarity).
                </div>
              )}
              {legendItems.map((it) => (
                <div key={it.label} className="flex items-center gap-2">
                  <span
                    className="inline-block w-4 h-1 rounded"
                    style={{ backgroundColor: it.color }}
                  />
                  {it.label}
                </div>
              ))}
              {legendItems.length === 0 && (
                <div className="text-gray-400">No links yet</div>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  )
}

export default function InterOfficeMap() {
  return (
    <ReactFlowProvider>
      <InterOfficeMapInner />
    </ReactFlowProvider>
  )
}

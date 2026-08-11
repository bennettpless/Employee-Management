'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeMouseHandler,
  type NodeTypes,
  type OnNodeDrag,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import {
  Loader2,
  LayoutGrid,
  RefreshCw,
  Workflow,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import DeviceNode, {
  type DeviceNodeData,
} from '@/components/network/DeviceNode'
import { computeAutoLayout } from '@/lib/network-layout'
import type {
  NetworkDevice,
  NetworkDeviceConnection,
} from '@/lib/types'

/**
 * Bundle of imperative export functions the parent page can invoke from its
 * ExportMenu. `null` means the topology isn't in a state where an export
 * would produce a valid image (loading, errored, or no devices yet).
 */
export type TopologyExports = {
  png: () => Promise<void>
  pdf: () => Promise<void>
} | null

interface OfficeTopologyProps {
  officeId: string
  officeName: string
  canEdit: boolean
  /**
   * Called with the imperative PNG/PDF export functions whenever the topology
   * transitions between "ready to export" and "not ready" (loading, error,
   * empty, or after a reload). The parent should stash these and drive its
   * own ExportMenu items with them.
   */
  onExportsReady?: (fns: TopologyExports) => void
  /**
   * Called whenever the topology's internal export state changes so the
   * parent's ExportMenu can show a spinner on the running item.
   */
  onExportingChange?: (state: 'png' | 'pdf' | null) => void
}

interface TopologyApiNode {
  id: string
  type: 'networkDevice'
  position: { x: number; y: number }
  data: { device: NetworkDevice }
}

interface TopologyApiEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string | null
  data: { connection: NetworkDeviceConnection }
}

interface TopologyApiResponse {
  nodes: TopologyApiNode[]
  edges: TopologyApiEdge[]
}

// Register the custom node type once at module scope. React Flow recreates
// internal state if `nodeTypes` is a new object on each render, so this MUST
// be a stable reference.
const nodeTypes: NodeTypes = {
  networkDevice: DeviceNode,
}

// Default edge styling — matches the blue accent used across the network UI.
const DEFAULT_EDGE_STYLE = {
  stroke: '#3b82f6',
  strokeWidth: 2,
}

function buildNodeData(
  device: NetworkDevice,
  canEdit: boolean
): DeviceNodeData {
  return {
    device,
    // When editing is enabled the operator typically wants to pan/drag, so
    // we suppress the name link to avoid accidental navigations. Read-only
    // viewers benefit from the link as a discovery affordance.
    linkToDetail: !canEdit,
  }
}

function apiEdgeToFlowEdge(e: TopologyApiEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    label: e.label ?? undefined,
    type: 'default',
    style: DEFAULT_EDGE_STYLE,
    data: e.data as unknown as Record<string, unknown>,
  }
}

function OfficeTopologyInner({
  officeId,
  officeName,
  canEdit,
  onExportsReady,
  onExportingChange,
}: OfficeTopologyProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<null | 'png' | 'pdf'>(null)
  const [savingLayout, setSavingLayout] = useState(false)

  // Reference to the React Flow viewport wrapper, used by html-to-image to
  // serialise just the diagram (without the toolbar) for PNG/PDF export.
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null)

  // Persist a device's position. Throttled implicitly by `onNodeDragStop`
  // firing once at the end of each drag.
  const persistPosition = useCallback(
    async (deviceId: string, x: number, y: number) => {
      try {
        const res = await fetch('/api/network/topology/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId,
            layout_x: x,
            layout_y: y,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setActionError(
            (data as { error?: string }).error ?? 'Failed to save position'
          )
        }
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Failed to save position'
        )
      }
    },
    []
  )

  const loadTopology = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(
        `/api/network/topology?officeId=${encodeURIComponent(officeId)}`
      )
      const data = (await res.json()) as TopologyApiResponse & {
        error?: string
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load topology')
      }

      const flowNodes: Node[] = data.nodes.map((n) => ({
        id: n.id,
        type: 'networkDevice',
        position: n.position,
        data: buildNodeData(n.data.device, canEdit),
      }))

      setNodes(flowNodes)
      setEdges(data.edges.map(apiEdgeToFlowEdge))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load topology')
    } finally {
      setLoading(false)
    }
  }, [officeId, canEdit, setNodes, setEdges])

  useEffect(() => {
    loadTopology()
  }, [loadTopology])

  // When the operator drops a node, write its new position back. We rely on
  // React Flow's internal store to have already applied the position update
  // via `onNodesChange`, so we just read the node's current position.
  // React Flow exposes the drag handler as `OnNodeDrag` — its event args are
  // DOM events, not React synthetic events, so we use its callback type
  // directly to keep TS happy across versions.
  const handleNodeDragStop = useCallback<OnNodeDrag<Node>>(
    (_event, node) => {
      if (!canEdit) return
      persistPosition(node.id, node.position.x, node.position.y)
    },
    [canEdit, persistPosition]
  )

  // Intercept node changes so we can ignore drag updates from non-admin
  // users entirely (defence in depth — `nodesDraggable={false}` on
  // ReactFlow already blocks the drag interaction).
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!canEdit) {
        const allowed = changes.filter((c) => c.type !== 'position')
        if (allowed.length > 0) onNodesChange(allowed)
        return
      }
      onNodesChange(changes)
    },
    [canEdit, onNodesChange]
  )

  // Drag-create a new edge.
  const handleConnect = useCallback(
    async (params: Connection) => {
      if (!canEdit) return
      if (!params.source || !params.target) return
      if (params.source === params.target) {
        setActionError('A device cannot connect to itself')
        return
      }

      // Add the edge optimistically so the diagram feels responsive, then
      // reconcile with the server response.
      const tempId = `temp-${params.source}-${params.target}-${Date.now()}`
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: tempId,
            type: 'default',
            style: DEFAULT_EDGE_STYLE,
          },
          eds
        )
      )
      setActionError(null)

      try {
        const res = await fetch(
          `/api/network/devices/${encodeURIComponent(params.source)}/connections`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_device_id: params.target }),
          }
        )
        const data = (await res.json()) as {
          connection?: NetworkDeviceConnection
          error?: string
        }
        if (!res.ok || !data.connection) {
          setEdges((eds) => eds.filter((e) => e.id !== tempId))
          setActionError(data.error || 'Failed to create connection')
          return
        }
        const newConnection = data.connection
        setEdges((eds) =>
          eds.map((e) =>
            e.id === tempId
              ? {
                  ...e,
                  id: newConnection.id,
                  data: { connection: newConnection },
                }
              : e
          )
        )
      } catch (err) {
        setEdges((eds) => eds.filter((e) => e.id !== tempId))
        setActionError(
          err instanceof Error ? err.message : 'Failed to create connection'
        )
      }
    },
    [canEdit, setEdges]
  )

  // Right-click an edge to delete it. We deliberately do not use
  // React Flow's built-in edge selection + Backspace flow because that
  // requires the diagram to be focused; right-click is more discoverable.
  const handleEdgeContextMenu = useCallback<EdgeMouseHandler>(
    async (event, edge) => {
      event.preventDefault()
      if (!canEdit) return
      if (!confirm('Delete this connection?')) return

      // We need the connection's source device to construct the URL.
      const sourceId = edge.source
      const previousEdges = edges
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
      setActionError(null)

      try {
        const res = await fetch(
          `/api/network/devices/${encodeURIComponent(sourceId)}/connections?connectionId=${encodeURIComponent(edge.id)}`,
          { method: 'DELETE' }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setEdges(previousEdges)
          setActionError(
            (data as { error?: string }).error ?? 'Failed to delete connection'
          )
        }
      } catch (err) {
        setEdges(previousEdges)
        setActionError(
          err instanceof Error ? err.message : 'Failed to delete connection'
        )
      }
    },
    [canEdit, edges, setEdges]
  )

  // Re-run the auto-layout algorithm and persist every node's new position
  // in a single batch.
  const handleAutoLayout = useCallback(async () => {
    if (!canEdit) return
    setActionError(null)
    setSavingLayout(true)
    try {
      const deviceList: NetworkDevice[] = nodes.map(
        (n) => (n.data as unknown as DeviceNodeData).device
      )
      const connectionList = edges
        .map(
          (e) =>
            (e.data as { connection?: NetworkDeviceConnection } | undefined)
              ?.connection
        )
        .filter((c): c is NetworkDeviceConnection => Boolean(c))

      const positions = computeAutoLayout(deviceList, connectionList)
      const positionById = new Map(
        positions.map((p) => [p.device_id, { x: p.x, y: p.y }])
      )

      setNodes((curr) =>
        curr.map((n) => {
          const pos = positionById.get(n.id)
          return pos ? { ...n, position: pos } : n
        })
      )

      const payload = positions.map((p) => ({
        device_id: p.device_id,
        layout_x: p.x,
        layout_y: p.y,
      }))

      const res = await fetch('/api/network/topology/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(
          (data as { error?: string }).error ?? 'Failed to save layout'
        )
      }
    } finally {
      setSavingLayout(false)
    }
  }, [canEdit, nodes, edges, setNodes])

  const safeFilenameBase = useMemo(
    () =>
      officeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'office',
    [officeName]
  )

  // PNG export — wraps html-to-image's `toPng` with a white background so
  // exports look right on light surfaces (Slack, email, docs).
  const exportPng = useCallback(async () => {
    if (!reactFlowWrapperRef.current) return
    setExporting('png')
    setActionError(null)
    try {
      const dataUrl = await toPng(reactFlowWrapperRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        // React Flow renders its controls and minimap as siblings of the
        // viewport. Filter them out so the export shows only the diagram.
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          if (node.classList?.contains('react-flow__minimap')) return false
          if (node.classList?.contains('react-flow__controls')) return false
          if (node.classList?.contains('react-flow__attribution')) return false
          return true
        },
      })
      const link = document.createElement('a')
      link.download = `${safeFilenameBase}-topology.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to export PNG'
      )
    } finally {
      setExporting(null)
    }
  }, [safeFilenameBase])

  // PDF export — renders the same PNG, then embeds it landscape into a single
  // PDF page so the operator can attach it to runbooks or change requests.
  const exportPdf = useCallback(async () => {
    if (!reactFlowWrapperRef.current) return
    setExporting('pdf')
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
      const pdf = new jsPDF({ orientation: 'landscape' })
      const props = pdf.getImageProperties(dataUrl)
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      // Fit the image inside the page bounds while preserving aspect ratio.
      const scale = Math.min(
        pageWidth / props.width,
        pageHeight / props.height
      )
      const w = props.width * scale
      const h = props.height * scale
      const x = (pageWidth - w) / 2
      const y = (pageHeight - h) / 2
      pdf.addImage(dataUrl, 'PNG', x, y, w, h)
      pdf.save(`${safeFilenameBase}-topology.pdf`)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to export PDF'
      )
    } finally {
      setExporting(null)
    }
  }, [safeFilenameBase])

  // Publish the export state upward so the parent's ExportMenu can show a
  // spinner on whichever item is currently running.
  useEffect(() => {
    onExportingChange?.(exporting)
  }, [exporting, onExportingChange])

  // Publish the export functions to the parent whenever the topology is in
  // a state where they'd produce a valid image (rendered wrapper + at least
  // one node). Otherwise publish `null` so the parent can disable those
  // items. Cleans up on unmount so a stale reference isn't retained.
  const topologyReady = !loading && !loadError && nodes.length > 0
  useEffect(() => {
    if (!onExportsReady) return
    if (topologyReady) {
      onExportsReady({ png: exportPng, pdf: exportPdf })
    } else {
      onExportsReady(null)
    }
    return () => {
      onExportsReady(null)
    }
  }, [topologyReady, exportPng, exportPdf, onExportsReady])

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
            <p className="font-medium">Failed to load topology</p>
            <p className="text-sm">{loadError}</p>
          </div>
          <button
            onClick={loadTopology}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Empty office — show a friendly hint instead of an empty React Flow that
  // looks broken.
  if (nodes.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-12 text-center">
        <Workflow className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 mb-1">
          No devices in this office yet.
        </p>
        <p className="text-sm text-gray-500">
          Add a device above to start building the topology diagram.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200 flex-wrap">
        <div className="flex items-center gap-2 text-gray-700">
          <Workflow className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold">Topology</h3>
          <span className="text-sm text-gray-500">
            ({nodes.length} device{nodes.length === 1 ? '' : 's'},{' '}
            {edges.length} connection{edges.length === 1 ? '' : 's'})
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <button
              onClick={handleAutoLayout}
              disabled={savingLayout}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Re-run the auto-layout algorithm"
            >
              {savingLayout ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LayoutGrid className="w-4 h-4" />
              )}
              Auto-layout
            </button>
          )}
          {/*
            PNG/PDF export moved to the page-level Export menu (Phase 18).
            The topology still owns the underlying export logic and publishes
            it upward via `onExportsReady` so there's only one export UI on
            the page.
          */}
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

      {canEdit && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-800 flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5" />
          Drag from one node's bottom handle to another's top handle to add a
          connection. Right-click an edge to delete it.
        </div>
      )}

      <div
        ref={reactFlowWrapperRef}
        style={{ width: '100%', height: '600px' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onEdgeContextMenu={handleEdgeContextMenu}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          edgesFocusable={canEdit}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function OfficeTopology(props: OfficeTopologyProps) {
  // React Flow requires a provider on the tree even when we use the
  // top-level <ReactFlow> component, because the toolbar buttons use
  // imperative APIs (zoom-to-fit, etc.) that pull state from the provider.
  return (
    <ReactFlowProvider>
      <OfficeTopologyInner {...props} />
    </ReactFlowProvider>
  )
}

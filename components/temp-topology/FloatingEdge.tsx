'use client'

/**
 * ⚠️ TEMPORARY MODULE — slated for removal (see lib/temp-topology/flag.ts).
 *
 * Custom edge for the inter-office map. Endpoints dock at the node handles that
 * the link was drawn between (React Flow supplies their coordinates), so lines
 * connect to fixed points on each office card rather than floating to an
 * arbitrary spot on the border.
 *
 * Lines are STRAIGHT by default. To bend an individual line, click it to select
 * it, then drag the round handle that appears at its midpoint — the bend is
 * stored per-link (`curveOffset`) and persists. Double-click the handle to snap
 * it back to straight. Only the links you bend curve; everything else stays a
 * direct line.
 */

import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import { useRef } from 'react'
import type { InterOfficeLink } from '@/lib/temp-topology/storage'

export default function FloatingEdge({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
}: EdgeProps) {
  const { setEdges, screenToFlowPosition } = useReactFlow()
  const draggingRef = useRef(false)

  const mx = (sourceX + targetX) / 2
  const my = (sourceY + targetY) / 2
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  // Left-hand unit normal of the source→target chord. The bend is stored
  // relative to this, so it rotates naturally as the offices move.
  const nx = -dy / len
  const ny = dx / len

  const link = (data as { link?: InterOfficeLink } | undefined)?.link
  const offset = typeof link?.curveOffset === 'number' ? link.curveOffset : 0
  const apexX = mx + nx * offset
  const apexY = my + ny * offset

  const edgePath =
    Math.abs(offset) < 1
      ? `M ${sourceX},${sourceY} L ${targetX},${targetY}`
      : // Quadratic control point chosen so the arc apex lands on (apexX, apexY).
        `M ${sourceX},${sourceY} Q ${2 * apexX - mx},${2 * apexY - my} ${targetX},${targetY}`

  const updateOffset = (value: number) => {
    setEdges((eds) =>
      eds.map((ed) => {
        if (ed.id !== id) return ed
        const link = (ed.data as { link?: InterOfficeLink } | undefined)?.link
        if (!link) return ed
        return { ...ed, data: { ...ed.data, link: { ...link, curveOffset: value } } }
      })
    )
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    draggingRef.current = true
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const value = (p.x - mx) * nx + (p.y - my) * ny
    updateOffset(Math.round(value))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${apexX}px, ${apexY}px)`,
              pointerEvents: 'all',
            }}
          >
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation()
                updateOffset(0)
              }}
              title="Drag to bend this line · double-click to straighten"
              className="w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

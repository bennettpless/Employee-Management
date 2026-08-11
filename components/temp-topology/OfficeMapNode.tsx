'use client'

/**
 * ⚠️ TEMPORARY MODULE — slated for removal (see lib/temp-topology/flag.ts).
 *
 * React Flow node representing a single office on the inter-office map.
 * Handles are placed on all four sides and the canvas runs in
 * `ConnectionMode.Loose`, so the operator can draw a link out of (or into)
 * whichever side faces the peer office — handy for a mesh of VPN tunnels.
 *
 * The node with the most links is flagged as the `isHub` and styled distinctly
 * (indigo, "HUB" badge); every node shows its current link count.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'

export interface OfficeMapNodeData {
  officeId: string
  name: string
  subtitle?: string
  deviceCount?: number
  connectionCount?: number
  isHub?: boolean
  [key: string]: unknown
}

const handleClass =
  '!w-2 !h-2 !bg-gray-400 !border !border-white hover:!bg-blue-500'

function OfficeMapNodeImpl({ data }: NodeProps) {
  const d = data as unknown as OfficeMapNodeData
  const isHub = d.isHub === true
  const count = typeof d.connectionCount === 'number' ? d.connectionCount : 0

  return (
    <div
      className={`bg-white rounded-lg shadow-md w-[190px] text-xs ${
        isHub
          ? 'border-2 border-indigo-500 ring-2 ring-indigo-200'
          : 'border-2 border-blue-300'
      }`}
    >
      <Handle id="t" type="source" position={Position.Top} className={handleClass} />
      <Handle id="r" type="source" position={Position.Right} className={handleClass} />
      <Handle id="b" type="source" position={Position.Bottom} className={handleClass} />
      <Handle id="l" type="source" position={Position.Left} className={handleClass} />

      <div
        className={`flex items-center justify-between gap-1.5 px-3 py-2 border-b ${
          isHub ? 'bg-indigo-50 border-indigo-100' : 'border-gray-100'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Building2
            className={`w-4 h-4 flex-shrink-0 ${
              isHub ? 'text-indigo-600' : 'text-blue-600'
            }`}
          />
          <Link
            href={`/network/offices/${d.officeId}`}
            className="font-semibold text-gray-900 truncate hover:text-blue-700"
            title={`Open ${d.name}`}
          >
            {d.name}
          </Link>
        </div>
        {isHub ? (
          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-indigo-600 text-white">
            Hub
          </span>
        ) : (
          count > 0 && (
            <span
              className="flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700"
              title={`${count} link${count === 1 ? '' : 's'}`}
            >
              {count}
            </span>
          )
        )}
      </div>

      <div className="px-3 py-2 space-y-0.5 text-gray-600">
        {d.subtitle && (
          <div className="truncate text-[11px]">{d.subtitle}</div>
        )}
        <div className="text-[11px] text-gray-500">
          {count} link{count === 1 ? '' : 's'}
          {typeof d.deviceCount === 'number' && (
            <span> &middot; {d.deviceCount} device{d.deviceCount === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>
    </div>
  )
}

const OfficeMapNode = memo(OfficeMapNodeImpl)
export default OfficeMapNode

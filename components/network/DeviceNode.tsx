'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import Link from 'next/link'
import {
  DeviceTypeIcon,
  DEVICE_TYPE_LABEL,
} from '@/components/network/NetworkDeviceTable'
import type { NetworkDevice, NetworkDeviceStatus } from '@/lib/types'

/**
 * Per-status dot colour for the badge in the top-right of each node card.
 * Matches the marker colours in `OfficeMap` for visual consistency across
 * the geographic and topology views.
 */
const STATUS_DOT: Record<NetworkDeviceStatus, string> = {
  online: 'bg-green-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  offline: 'bg-gray-400',
  unknown: 'bg-gray-300',
}

export interface DeviceNodeData {
  device: NetworkDevice
  // When false (the topology toolbar is in read-only mode), we render the
  // device name as plain text instead of a link so clicks don't navigate
  // away while the operator is panning the diagram.
  linkToDetail?: boolean
  [key: string]: unknown
}

/**
 * Custom React Flow node for a single `network_devices` row.
 *
 * Layout (top-down):
 *   - target Handle on top (incoming edges)
 *   - icon + name on the left, status dot on the right
 *   - device type, IP, manufacturer/model rows
 *   - source Handle on bottom (outgoing edges)
 *
 * Both handles are rendered regardless of whether the node has connections —
 * React Flow needs an attachment point on each side to let the operator
 * drag-create new edges.
 */
function DeviceNodeImpl({ data }: NodeProps) {
  const nodeData = data as unknown as DeviceNodeData
  const device = nodeData.device
  const linkToDetail = nodeData.linkToDetail !== false

  return (
    <div
      className="bg-white border border-gray-300 rounded-lg shadow-md w-[200px] text-xs"
      data-device-id={device.id}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !border-blue-700"
      />

      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-1.5 min-w-0">
          <DeviceTypeIcon
            type={device.device_type}
            className="w-4 h-4 text-blue-600 flex-shrink-0"
          />
          {linkToDetail ? (
            <Link
              href={`/network/devices/${device.id}`}
              className="font-semibold text-gray-900 truncate hover:text-blue-700"
              title={device.name}
            >
              {device.name}
            </Link>
          ) : (
            <span
              className="font-semibold text-gray-900 truncate"
              title={device.name}
            >
              {device.name}
            </span>
          )}
        </div>
        <span
          aria-label={`Status: ${device.status}`}
          title={`Status: ${device.status}`}
          className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
            STATUS_DOT[device.status]
          }`}
        />
      </div>

      <div className="px-3 py-2 space-y-1 text-gray-600">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">
          {DEVICE_TYPE_LABEL[device.device_type]}
        </div>
        {device.management_ip && (
          <div className="font-mono text-[11px] text-gray-700 truncate">
            {device.management_ip}
          </div>
        )}
        {(device.manufacturer || device.model) && (
          <div className="truncate text-[11px]">
            {[device.manufacturer, device.model].filter(Boolean).join(' ')}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !border-blue-700"
      />
    </div>
  )
}

const DeviceNode = memo(DeviceNodeImpl)
export default DeviceNode

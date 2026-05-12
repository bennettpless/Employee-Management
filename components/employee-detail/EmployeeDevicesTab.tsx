'use client'

import Link from 'next/link'
import { Server, Loader2, Monitor, Smartphone, Laptop, Plus, Trash2 } from 'lucide-react'
import { Device, PreviousDevice } from '@/lib/types'
import { format } from 'date-fns'

interface EmployeeDevicesTabProps {
  devices: Device[]
  previousDevices: PreviousDevice[]
  removingDevice: string | null
  onOpenAddDevice: () => void
  onRemoveDevice: (deviceId: string, deviceName: string) => void
}

function getDeviceIcon(deviceType: string) {
  const type = deviceType?.toLowerCase() || ''
  if (type.includes('laptop')) return <Laptop className="w-5 h-5" />
  if (type.includes('phone') || type.includes('mobile')) return <Smartphone className="w-5 h-5" />
  if (type.includes('desktop')) return <Monitor className="w-5 h-5" />
  return <Server className="w-5 h-5" />
}

export default function EmployeeDevicesTab({
  devices,
  previousDevices,
  removingDevice,
  onOpenAddDevice,
  onRemoveDevice,
}: EmployeeDevicesTabProps) {
  return (
    <div className="space-y-8">
      {/* Current Devices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Current Devices</h3>
          <button
            onClick={onOpenAddDevice}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Device
          </button>
        </div>
        {devices.length > 0 ? (
          <div className="space-y-3">
            {devices.map((device: any) => (
              <div
                key={device.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all hover:border-blue-500 hover:bg-blue-50"
              >
                <Link
                  href={`/devices/${device.id}`}
                  className="flex items-center flex-1"
                >
                  <div className="bg-blue-100 rounded-lg p-2 mr-3">
                    {getDeviceIcon(device.device_type)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{device.device_name}</h4>
                    {device.device_type && (
                      <p className="text-sm text-gray-500 mt-1">Type: {device.device_type}</p>
                    )}
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    onRemoveDevice(device.id, device.device_name)
                  }}
                  disabled={removingDevice === device.id}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove device"
                >
                  {removingDevice === device.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No devices currently assigned to this employee</p>
            <button
              onClick={onOpenAddDevice}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Device
            </button>
          </div>
        )}
      </div>

      {/* Previous Devices */}
      {previousDevices.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Previous Devices</h3>
          <div className="space-y-3">
            {previousDevices.map((device: any) => (
              <Link
                key={device.id}
                href={`/devices/${device.id}`}
                className="flex items-center justify-between border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-gray-400 hover:bg-gray-50 opacity-75"
              >
                <div className="flex items-center">
                  <div className="bg-gray-100 rounded-lg p-2 mr-3">
                    {getDeviceIcon(device.device_type)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{device.device_name}</h4>
                    {device.unassignment_date && (
                      <p className="text-sm text-gray-500">
                        Unassigned on {format(new Date(device.unassignment_date), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
                {device.assignment_date && (
                  <div className="text-sm text-gray-500 text-right">
                    <div>Assigned: {format(new Date(device.assignment_date), 'MMM d, yyyy')}</div>
                    {device.unassignment_date && (
                      <div>Unassigned: {format(new Date(device.unassignment_date), 'MMM d, yyyy')}</div>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, Server, Monitor, Smartphone, Laptop, Loader2, 
  User, HardDrive, Calendar, Building, Home
} from 'lucide-react'
import { format } from 'date-fns'

interface DeviceWithRelations {
  id: string
  ninja_device_id: string
  device_name: string | null
  device_type: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  os_name: string | null
  os_version: string | null
  last_seen: string | null
  status: string
  employee?: {
    id: string
    display_name: string | null
    email: string
    first_name: string | null
    last_name: string | null
  }
  current_users?: Array<{
    employee: {
      id: string
      display_name: string | null
      email: string
      first_name: string | null
      last_name: string | null
    }
    assignment_date: string
    registered_date?: string
  }>
  previous_users?: Array<{
    employee: {
      id: string
      display_name: string | null
      email: string
      first_name: string | null
      last_name: string | null
    }
    assignment_date: string
    unassignment_date: string | null
    registered_date?: string
  }>
}

export default function DeviceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [device, setDevice] = useState<DeviceWithRelations | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchDevice(params.id as string)
    }
  }, [params.id])

  const fetchDevice = async (id: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/devices/${id}`)
      const data = await response.json()
      setDevice(data.device)
    } catch (error) {
      console.error('Error fetching device:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDeviceIcon = (deviceType: string | null) => {
    const type = deviceType?.toLowerCase() || ''
    if (type.includes('laptop')) return <Laptop className="w-8 h-8 text-blue-600" />
    if (type.includes('phone') || type.includes('mobile')) return <Smartphone className="w-8 h-8 text-blue-600" />
    if (type.includes('desktop')) return <Monitor className="w-8 h-8 text-blue-600" />
    return <Server className="w-8 h-8 text-blue-600" />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Device not found</h2>
            <Link href="/devices" className="text-blue-600 hover:text-blue-800">
              Back to Devices
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          <Link
            href="/"
            className="inline-flex items-center text-gray-600 hover:text-gray-800 transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Home
          </Link>
        </div>

        {/* Device Info */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center">
              <div className="bg-blue-100 rounded-lg p-4 mr-6">
                {getDeviceIcon(device.device_type)}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {device.device_name || 'Unknown Device'}
                </h1>
                {device.device_type && (
                  <p className="text-lg text-gray-600 mb-3">{device.device_type}</p>
                )}
                <span className={`px-4 py-1 rounded-full text-sm font-semibold border ${
                  device.status === 'active' 
                    ? 'bg-green-100 text-green-800 border-green-200' 
                    : 'bg-gray-100 text-gray-800 border-gray-200'
                }`}>
                  {device.status}
                </span>
              </div>
            </div>
          </div>

          {/* Device Details Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {device.manufacturer && (
              <div className="flex items-center">
                <div className="bg-blue-100 rounded-lg p-3 mr-4">
                  <Building className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Manufacturer</div>
                  <div className="font-medium text-gray-900">{device.manufacturer}</div>
                </div>
              </div>
            )}

            {device.model && (
              <div className="flex items-center">
                <div className="bg-purple-100 rounded-lg p-3 mr-4">
                  <Server className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Model</div>
                  <div className="font-medium text-gray-900">{device.model}</div>
                </div>
              </div>
            )}

            {device.serial_number && (
              <div className="flex items-center">
                <div className="bg-orange-100 rounded-lg p-3 mr-4">
                  <HardDrive className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Serial Number</div>
                  <div className="font-medium text-gray-900 font-mono text-sm">{device.serial_number}</div>
                </div>
              </div>
            )}

            {device.os_name && (
              <div className="flex items-center">
                <div className="bg-green-100 rounded-lg p-3 mr-4">
                  <Monitor className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Operating System</div>
                  <div className="font-medium text-gray-900">
                    {device.os_name} {device.os_version && `(${device.os_version})`}
                  </div>
                </div>
              </div>
            )}

            {device.last_seen && (
              <div className="flex items-center">
                <div className="bg-cyan-100 rounded-lg p-3 mr-4">
                  <Calendar className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Last Seen</div>
                  <div className="font-medium text-gray-900">
                    {format(new Date(device.last_seen), 'MMM d, yyyy h:mm a')}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Assigned Users Section */}
        {(device.current_users && device.current_users.length > 0) || (device.previous_users && device.previous_users.length > 0) ? (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-2xl font-bold text-gray-900">Assigned Users</h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Current Users */}
              {device.current_users && device.current_users.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Current</h3>
                  <div className="space-y-3">
                    {device.current_users.map((assignment: any, idx: number) => (
                      <Link
                        key={assignment.employee.id || idx}
                        href={`/employees/${assignment.employee.id}`}
                        className="flex items-center justify-between border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-500 hover:bg-blue-50"
                      >
                        <div className="flex items-center">
                          <div className="bg-blue-100 rounded-lg p-2 mr-3">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              {assignment.employee.display_name || 
                               `${assignment.employee.first_name || ''} ${assignment.employee.last_name || ''}`.trim() ||
                               assignment.employee.email}
                            </h4>
                            <p className="text-sm text-gray-500">{assignment.employee.email}</p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 text-right">
                          {assignment.assignment_date && (
                            <div>Assigned: {format(new Date(assignment.assignment_date), 'MMM d, yyyy')}</div>
                          )}
                          {assignment.registered_date && (
                            <div className="text-xs">Registered: {format(new Date(assignment.registered_date), 'MMM d, yyyy')}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Previous Users */}
              {device.previous_users && device.previous_users.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Previous</h3>
                  <div className="space-y-3">
                    {device.previous_users.map((assignment: any, idx: number) => (
                      <Link
                        key={assignment.employee.id || idx}
                        href={`/employees/${assignment.employee.id}`}
                        className="flex items-center justify-between border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-gray-400 hover:bg-gray-50 opacity-75"
                      >
                        <div className="flex items-center">
                          <div className="bg-gray-100 rounded-lg p-2 mr-3">
                            <User className="w-5 h-5 text-gray-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              {assignment.employee.display_name || 
                               `${assignment.employee.first_name || ''} ${assignment.employee.last_name || ''}`.trim() ||
                               assignment.employee.email}
                            </h4>
                            <p className="text-sm text-gray-500">{assignment.employee.email}</p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 text-right">
                          {assignment.assignment_date && (
                            <div>Assigned: {format(new Date(assignment.assignment_date), 'MMM d, yyyy')}</div>
                          )}
                          {assignment.unassignment_date && (
                            <div>Unassigned: {format(new Date(assignment.unassignment_date), 'MMM d, yyyy')}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="text-center py-4">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No user assignments recorded for this device</p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}


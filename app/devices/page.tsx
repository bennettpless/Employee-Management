'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Server, Loader2, Monitor, Smartphone, Laptop, HardDrive, Search, Filter, X } from 'lucide-react'
import { Device } from '@/lib/types'

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'ninja-only' | 'azure-only'>('all')
  const [counts, setCounts] = useState<{ all: number; inNinja: number; inAzure: number; ninjaOnly: number; azureOnly: number; inBoth: number }>({ all: 0, inNinja: 0, inAzure: 0, ninjaOnly: 0, azureOnly: 0, inBoth: 0 })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType])

  const fetchDevices = async () => {
    try {
      setLoading(true)
      const url = filterType !== 'all' ? `/api/devices?filter=${filterType}` : '/api/devices'
      const response = await fetch(url)
      const data = await response.json()
      setDevices(data.devices || [])
      if (data.counts) {
        setCounts(data.counts)
      }
    } catch (error) {
      console.error('Error fetching devices:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter by search term only (device type filtering is done server-side)
  const filteredDevices = devices.filter(device => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      const deviceNameMatch = (device.device_name || '').toLowerCase().includes(searchLower)
      const userMatch = (device as any).employee?.display_name?.toLowerCase().includes(searchLower) ||
                       (device as any).employee?.email?.toLowerCase().includes(searchLower) ||
                       `${(device as any).employee?.first_name || ''} ${(device as any).employee?.last_name || ''}`.toLowerCase().includes(searchLower)
      
      return deviceNameMatch || userMatch
    }
    
    return true
  })

  const hasActiveFilters = filterType !== 'all'

  const clearFilters = () => {
    setFilterType('all')
    setSearchTerm('')
  }

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType?.toLowerCase() || ''
    if (type.includes('laptop')) return <Laptop className="w-5 h-5 text-blue-600" />
    if (type.includes('phone') || type.includes('mobile')) return <Smartphone className="w-5 h-5 text-blue-600" />
    if (type.includes('desktop')) return <Monitor className="w-5 h-5 text-blue-600" />
    return <Server className="w-5 h-5 text-blue-600" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Devices
              {!loading && (
                <span className="ml-3 text-2xl font-normal text-gray-500">
                  ({filteredDevices.length}{searchTerm ? ` of ${counts.all}` : ''})
                </span>
              )}
            </h1>
            <p className="text-gray-600">All devices synced from NinjaOne and Azure</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {/* Search Bar */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by device name or assigned user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {hasActiveFilters && (
                <span className="bg-white text-blue-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                  1
                </span>
              )}
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
              >
                <X className="w-5 h-5" />
                Clear
              </button>
            )}
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Device Source
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    filterType === 'all'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  All Devices
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                    filterType === 'all' ? 'bg-blue-400 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {counts.all}
                  </span>
                </button>
                <button
                  onClick={() => setFilterType('ninja-only')}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    filterType === 'ninja-only'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  NinjaOne Only
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                    filterType === 'ninja-only' ? 'bg-green-400 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {counts.ninjaOnly}
                  </span>
                </button>
                <button
                  onClick={() => setFilterType('azure-only')}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    filterType === 'azure-only'
                      ? 'bg-orange-400 text-white border-orange-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Intune Only
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                    filterType === 'azure-only' ? 'bg-orange-300 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {counts.azureOnly}
                  </span>
                </button>
              </div>
              {counts.inBoth > 0 && (
                <p className="mt-3 text-xs text-gray-500">
                  {counts.inBoth} device{counts.inBoth !== 1 ? 's' : ''} exist in both NinjaOne and Intune
                </p>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No devices found
            </h3>
            <p className="text-gray-600">
              {searchTerm 
                ? `No devices found matching "${searchTerm}"`
                : filterType !== 'all'
                  ? `No ${filterType === 'ninja-only' ? 'NinjaOne' : 'Azure'} devices found`
                  : 'Run a sync to populate devices'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDevices.map((device) => (
              <Link key={device.id} href={`/devices/${device.id}`}>
                <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-500">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="bg-blue-100 rounded-lg p-3 mr-3">
                      {getDeviceIcon(device.device_type || '')}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{device.device_name}</h3>
                      <p className="text-sm text-gray-600">{device.device_type}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      device.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {device.status}
                    </span>
                    {!(device as any).is_in_ninja && (
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                        Azure Only
                      </span>
                    )}
                  </div>
                </div>

                {device.employee && (
                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <p className="text-sm text-gray-600">Assigned to:</p>
                    <Link 
                      href={`/employees/${device.employee.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {device.employee.display_name}
                    </Link>
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  {device.manufacturer && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Manufacturer:</span>
                      <span className="font-medium text-gray-900">{device.manufacturer}</span>
                    </div>
                  )}
                  {device.model && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Model:</span>
                      <span className="font-medium text-gray-900">{device.model}</span>
                    </div>
                  )}
                  {device.os_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">OS:</span>
                      <span className="font-medium text-gray-900">{device.os_name}</span>
                    </div>
                  )}
                </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



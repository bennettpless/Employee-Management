'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, HardDrive, Loader2, ChevronDown, ChevronUp, Monitor, User, Server, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

interface SoftwareDevice {
  device: {
    id: string
    device_name: string | null
    device_type: string | null
    manufacturer: string | null
    model: string | null
    os_name: string | null
    os_version: string | null
    employee?: {
      id: string
      display_name: string | null
      email: string
      first_name: string | null
      last_name: string | null
    }
  }
  install_date: string | null
}

interface SoftwareVersion {
  version: string | null
  deviceCount: number
  devices: SoftwareDevice[]
}

interface SoftwareItem {
  name: string
  publisher: string | null
  versions: SoftwareVersion[]
}

export default function SoftwarePage() {
  const [software, setSoftware] = useState<SoftwareItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedSoftware, setExpandedSoftware] = useState<Set<string>>(new Set())
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 50 // Items per page

  useEffect(() => {
    fetchSoftware(page)
  }, [page])

  const fetchSoftware = async (pageNum: number) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/software?page=${pageNum}&limit=${limit}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Error fetching software:', response.status, errorData)
        setSoftware([])
        return
      }
      
      const data = await response.json()
      
      if (data.error) {
        console.error('API error:', data.error)
        setSoftware([])
        return
      }
      
      setSoftware(data.software || [])
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages)
        setTotalItems(data.pagination.totalItems)
      }
    } catch (error) {
      console.error('Error fetching software:', error)
      setSoftware([])
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage)
      // Scroll to top when page changes
      window.scrollTo({ top: 0, behavior: 'smooth' })
      // Reset expanded items when changing pages
      setExpandedSoftware(new Set())
      setExpandedVersions(new Set())
    }
  }

  const toggleSoftware = (softwareName: string) => {
    const newExpanded = new Set(expandedSoftware)
    if (newExpanded.has(softwareName)) {
      newExpanded.delete(softwareName)
    } else {
      newExpanded.add(softwareName)
    }
    setExpandedSoftware(newExpanded)
  }

  const toggleVersion = (key: string) => {
    const newExpanded = new Set(expandedVersions)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedVersions(newExpanded)
  }

  const filteredSoftware = software.filter(sw =>
    sw.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sw.publisher?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Software Inventory</h1>
              <p className="text-gray-600">
                View all software, versions, and identify devices that need updates
                {totalItems > 0 && (
                  <span className="ml-2 font-semibold">
                    ({totalItems.toLocaleString()} software items)
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <input
            type="text"
            placeholder="Search software by name or publisher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Software List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
          </div>
        ) : filteredSoftware.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <HardDrive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No software found
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search' : 'Run a NinjaOne sync to populate software data'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSoftware.map((item) => {
              const isExpanded = expandedSoftware.has(item.name)
              const totalDevices = item.versions.reduce((sum, v) => sum + v.deviceCount, 0)

              return (
                <div key={item.name} className="bg-white rounded-lg shadow-md overflow-hidden">
                  {/* Software Header */}
                  <div 
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleSoftware(item.name)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">{item.name}</h3>
                        </div>
                        {item.publisher && (
                          <p className="text-sm text-gray-600 mb-3">{item.publisher}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span><strong>{item.versions.length}</strong> version{item.versions.length !== 1 ? 's' : ''}</span>
                          <span><strong>{totalDevices}</strong> device{totalDevices !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Versions */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50">
                      {item.versions.map((version) => {
                        const versionKey = `${item.name}-${version.version}`
                        const isVersionExpanded = expandedVersions.has(versionKey)

                        return (
                          <div key={version.version || 'no-version'} className="border-b border-gray-200 last:border-b-0">
                            {/* Version Header */}
                            <div 
                              className="p-4 cursor-pointer hover:bg-gray-100 transition-colors"
                              onClick={() => toggleVersion(versionKey)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-gray-900">
                                    Version: {version.version || '(no version)'}
                                  </span>
                                  <span className="text-sm text-gray-600">
                                    ({version.deviceCount} device{version.deviceCount !== 1 ? 's' : ''})
                                  </span>
                                </div>
                                {isVersionExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                            </div>

                            {/* Device List */}
                            {isVersionExpanded && version.devices.length > 0 && (
                              <div className="bg-white px-4 pb-4">
                                <div className="grid md:grid-cols-2 gap-4 mt-2">
                                  {version.devices.map((ds, idx) => (
                                    <div key={`${ds.device.id}-${idx}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center">
                                          <Monitor className="w-4 h-4 text-gray-400 mr-2" />
                                          <span className="font-semibold text-gray-900">
                                            {ds.device.device_name || 'Unknown Device'}
                                          </span>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                          {ds.device.device_type}
                                        </span>
                                      </div>
                                      
                                      {ds.device.employee && (
                                        <div className="mb-2 flex items-center text-sm text-gray-600">
                                          <User className="w-3 h-3 mr-1" />
                                          <Link 
                                            href={`/employees/${ds.device.employee.id}`}
                                            className="text-blue-600 hover:text-blue-800"
                                          >
                                            {ds.device.employee.display_name || 
                                             `${ds.device.employee.first_name} ${ds.device.employee.last_name}`}
                                          </Link>
                                        </div>
                                      )}

                                      <div className="text-xs text-gray-500 space-y-1">
                                        {ds.device.manufacturer && ds.device.model && (
                                          <div>{ds.device.manufacturer} {ds.device.model}</div>
                                        )}
                                        {ds.device.os_name && (
                                          <div>OS: {ds.device.os_name} {ds.device.os_version || ''}</div>
                                        )}
                                        {ds.install_date && (
                                          <div>Installed: {format(new Date(ds.install_date), 'MMM d, yyyy')}</div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="mt-8 bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing page {page} of {totalPages} ({totalItems.toLocaleString()} total items)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1}
                  className={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                    page === 1
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (page <= 3) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = page - 2 + i
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-2 rounded-lg border transition-colors ${
                          page === pageNum
                            ? 'bg-purple-500 text-white border-purple-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages}
                  className={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                    page === totalPages
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



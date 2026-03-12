'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, User, Mail, Phone, Briefcase, MapPin, Calendar, 
  Server, Key, Loader2, Monitor, Smartphone, Laptop,
  HardDrive, Home, Edit, X, Save, UserMinus, AlertTriangle, Plus, Trash2
} from 'lucide-react'
import { EmployeeWithRelations } from '@/lib/types'
import { format } from 'date-fns'

export default function EmployeeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [employee, setEmployee] = useState<EmployeeWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'licenses'>('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [isOffboarding, setIsOffboarding] = useState(false)
  const [offboarding, setOffboarding] = useState(false)
  const [isAddingDevice, setIsAddingDevice] = useState(false)
  const [addingDevice, setAddingDevice] = useState(false)
  const [removingDevice, setRemovingDevice] = useState<string | null>(null)
  const [newDeviceForm, setNewDeviceForm] = useState({ device_name: '', device_type: '' })
  const lastUpdateTimeRef = useRef<number>(0) // Track when we last updated from PUT response
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0) // Track when we last updated from PUT response

  useEffect(() => {
    if (params.id) {
      fetchEmployee(params.id as string)
    }
  }, [params.id])

  // Refresh data when page becomes visible or when navigating back to it
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && params.id) {
        // Small delay to ensure page is fully visible
        setTimeout(() => {
          fetchEmployee(params.id as string, false)
        }, 100)
      }
    }

    const handleFocus = () => {
      if (params.id) {
        // Refresh data when window regains focus
        fetchEmployee(params.id as string, false)
      }
    }

    // Handle browser back/forward navigation (pages loaded from cache)
    const handlePageshow = (e: PageTransitionEvent) => {
      if (e.persisted && params.id) {
        // Page was loaded from cache, refresh data
        fetchEmployee(params.id as string, false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageshow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageshow)
    }
  }, [params.id])

  const fetchEmployee = async (id: string, showLoading: boolean = true) => {
    try {
      if (showLoading) {
      setLoading(true)
      }
      // Add cache-busting to ensure fresh data - use multiple strategies
      const timestamp = Date.now()
      const random = Math.random()
      // Check if we recently updated this employee (within last 10 seconds)
      const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current
      const isRecentUpdate = timeSinceLastUpdate < 10000
      
      const response = await fetch(`/api/employees/${id}?t=${timestamp}&r=${random}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Request-ID': `${timestamp}-${random}`,
          'X-Recent-Update': isRecentUpdate ? 'true' : 'false'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch employee: ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('Fetched employee detail:', data.employee?.display_name || data.employee?.email)
      console.log('Full employee data from API:', data.employee)
      console.log('Department:', data.employee?.department)
      console.log('Phone:', data.employee?.phone_number)
      console.log('Devices in response:', data.employee?.devices?.length || 0)
      if (data.employee?.devices && data.employee.devices.length > 0) {
        data.employee.devices.forEach((device: any, idx: number) => {
          console.log(`  Device ${idx + 1}: ${device.device_name} (id: ${device.id}, employee_id: ${device.employee_id})`)
        })
      }
      
      // Force state update by creating a new object reference
      if (data.employee) {
        console.log('Setting employee state with full data:', data.employee)
        console.log('Department in API response:', data.employee.department)
        console.log('Phone in API response:', data.employee.phone_number)
        console.log('Updated at in API response:', data.employee.updated_at)
        
        // Check if we recently updated from a PUT response (within last 5 seconds)
        // This prevents stale GET data from overwriting fresh PUT data
        const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current
        if (timeSinceLastUpdate < 5000) {
          console.log(`⚠️ Skipping GET state update - we updated from PUT ${timeSinceLastUpdate}ms ago`)
          console.log('  This prevents stale GET data from overwriting fresh PUT data')
          return // Don't update state with potentially stale GET data
        }
        
        // Only update if this data is newer than what we have, or if we don't have employee data yet
        const apiUpdatedAt = data.employee.updated_at ? new Date(data.employee.updated_at).getTime() : 0
        const currentUpdatedAt = employee?.updated_at ? new Date(employee.updated_at).getTime() : 0
        
        if (!employee || apiUpdatedAt >= currentUpdatedAt) {
          console.log('✅ Updating state - API data is newer or equal')
          // Create a completely new object to force React to re-render
          const newEmployee = JSON.parse(JSON.stringify(data.employee))
          setEmployee(newEmployee)
        } else {
          console.log('⚠️ Skipping state update - current data is newer')
          console.log(`  Current updated_at: ${employee.updated_at} (${currentUpdatedAt})`)
          console.log(`  API updated_at: ${data.employee.updated_at} (${apiUpdatedAt})`)
        }
      }
    } catch (error) {
      console.error('Error fetching employee:', error)
    } finally {
      if (showLoading) {
      setLoading(false)
      }
    }
  }

  const handleSave = async () => {
    if (!employee) return
    
    try {
      setSaving(true)
      const response = await fetch(`/api/employees/${employee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm)
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update employee')
      }
      
      // Close modal first
      setIsEditing(false)
      
      // Refresh full employee data to ensure UI is up to date
      // This ensures we get all relations (devices, licenses) and the latest data
      await fetchEmployee(employee.id)
      
      // Also update state immediately with the response data as a fallback
      if (data.employee) {
        console.log('✅ Updating state with PUT response data:', data.employee)
        console.log('✅ Department from PUT response:', data.employee.department)
        console.log('✅ Updated at from PUT response:', data.employee.updated_at)
        
        // Create a completely new object to force React re-render
        const newEmployee = JSON.parse(JSON.stringify({
          ...employee,
          ...data.employee,
          // Preserve relations that weren't updated (will be refreshed by fetchEmployee)
          devices: employee.devices || [],
          license_assignments: employee.license_assignments || [],
          previous_devices: employee.previous_devices || [],
          manager: employee.manager || null
        }))
        
        console.log('✅ Setting employee state with new data')
        setEmployee(newEmployee)
        
        // Set a flag to prevent GET requests from overwriting this for the next 5 seconds
        lastUpdateTimeRef.current = Date.now()
        console.log(`✅ Set lastUpdateTimeRef to ${lastUpdateTimeRef.current} - will ignore stale GET responses for 5 seconds`)
      } else {
        console.error('❌ PUT response missing employee data')
      }
      
      alert('Employee information updated successfully!')
    } catch (error: any) {
      console.error('Error updating employee:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleOffboard = async () => {
    if (!employee) return
    
    try {
      setOffboarding(true)
      const response = await fetch(`/api/employees/${employee.id}/offboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to offboard employee')
      }
      
      alert('Employee offboarded successfully!')
      router.push('/employees')
    } catch (error: any) {
      console.error('Error offboarding employee:', error)
      alert(`Error offboarding employee: ${error.message}`)
    } finally {
      setOffboarding(false)
      setIsOffboarding(false)
    }
  }

  const handleAddDevice = async () => {
    if (!employee || !newDeviceForm.device_name.trim()) {
      alert('Please enter a device name')
      return
    }
    
    const deviceName = newDeviceForm.device_name.trim()
    
    try {
      setAddingDevice(true)
      const response = await fetch(`/api/employees/${employee.id}/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_name: deviceName,
          device_type: newDeviceForm.device_type.trim() || null
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add device')
      }
      
      // Refresh employee data to show the new device
      await fetchEmployee(employee.id)
      
      // Keep modal open and show "Syncing with NinjaOne..." message
      // Clear the form input but keep modal open during polling
      setNewDeviceForm({ device_name: '', device_type: '' })
      // Keep isAddingDevice true and addingDevice true to show loading state during polling
      
      // Poll for NinjaOne sync completion
      const syncStartTime = Date.now()
      let attempts = 0
      const maxAttempts = 120 // 2 minutes max (120 * 1 second)
      let pollingStopped = false
      
      const checkNinjaSync = async (): Promise<void> => {
        if (pollingStopped) return
        
        attempts++
        if (attempts > maxAttempts) {
          console.log('⚠️ NinjaOne sync polling timeout after 2 minutes')
          pollingStopped = true
          setAddingDevice(false)
          setNewDeviceForm({ device_name: '', device_type: '' }) // Reset form
          setIsAddingDevice(false) // Close modal
          alert(`Device "${deviceName}" added successfully! NinjaOne sync is still running in the background.`)
          return
        }
        
        try {
          const logsResponse = await fetch(`/api/sync/logs?t=${Date.now()}`, {
            cache: 'no-store'
          })
          const logsData = await logsResponse.json()
          const logs = logsData.logs || []
          
          // Find the most recent NinjaOne sync log
          const ninjaLogs = logs.filter((log: any) => log.sync_type === 'ninjaone')
          const latestNinjaLog = ninjaLogs.length > 0 ? ninjaLogs[0] : null
          
          if (latestNinjaLog) {
            const logStartTime = new Date(latestNinjaLog.started_at).getTime()
            const isRecentSync = logStartTime >= syncStartTime - 5000 // 5 second buffer
            
            if (isRecentSync) {
              const completedAt = latestNinjaLog.completed_at
              const status = latestNinjaLog.status
              
              const isCompleted = completedAt && 
                                 completedAt !== null && 
                                 completedAt !== '' &&
                                 String(completedAt).trim() !== '' &&
                                 (status === 'success' || status === 'partial' || status === 'failed')
              
              if (isCompleted) {
                console.log('✅ NinjaOne sync completed')
                pollingStopped = true
                setAddingDevice(false)
                setNewDeviceForm({ device_name: '', device_type: '' }) // Reset form
                setIsAddingDevice(false) // Close modal
                alert(`Device "${deviceName}" added successfully! NinjaOne sync completed.`)
                await fetchEmployee(employee.id) // Refresh to show updated device info
                return
              }
            }
          }
          
          // Continue polling
          setTimeout(() => {
            if (!pollingStopped) {
              checkNinjaSync()
            }
          }, 1000) // Poll every 1 second
        } catch (error) {
          console.error('Error checking NinjaOne sync status:', error)
          // Continue polling on error
          setTimeout(() => {
            if (!pollingStopped) {
              checkNinjaSync()
            }
          }, 1000)
        }
      }
      
      // Start polling after a short delay to allow sync to start
      setTimeout(() => {
        if (!pollingStopped) {
          checkNinjaSync()
        }
      }, 2000) // Wait 2 seconds before first check
      
    } catch (error: any) {
      console.error('Error adding device:', error)
      setAddingDevice(false)
      alert(`Error adding device: ${error.message}`)
    }
  }

  const handleRemoveDevice = async (deviceId: string, deviceName: string) => {
    if (!employee || !confirm(`Are you sure you want to remove device "${deviceName}" from ${employee.display_name || employee.email}?`)) {
      return
    }
    
    try {
      setRemovingDevice(deviceId)
      const response = await fetch(`/api/employees/${employee.id}/devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove device')
      }
      
      // Refresh employee data to reflect the change
      await fetchEmployee(employee.id)
      
      alert(`Device "${deviceName}" removed successfully!`)
    } catch (error: any) {
      console.error('Error removing device:', error)
      alert(`Error removing device: ${error.message}`)
    } finally {
      setRemovingDevice(null)
    }
  }

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType?.toLowerCase() || ''
    if (type.includes('laptop')) return <Laptop className="w-5 h-5" />
    if (type.includes('phone') || type.includes('mobile')) return <Smartphone className="w-5 h-5" />
    if (type.includes('desktop')) return <Monitor className="w-5 h-5" />
    return <Server className="w-5 h-5" />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Employee not found</h2>
            <Link href="/employees" className="text-blue-600 hover:text-blue-800">
              Back to Employees
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const statusColors = {
    active: 'bg-green-100 text-green-800 border-green-200',
    terminated: 'bg-red-100 text-red-800 border-red-200',
    on_leave: 'bg-yellow-100 text-yellow-800 border-yellow-200'
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

        {/* Profile Section */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start">
              <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="w-12 h-12 text-blue-600" />
              </div>
              <div className="ml-6">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {employee.display_name || `${employee.first_name} ${employee.last_name}`}
                </h1>
                {employee.job_title && (
                  <p className="text-lg text-gray-600 mb-3">{employee.job_title}</p>
                )}
                <span className={`px-4 py-1 rounded-full text-sm font-semibold border ${statusColors[employee.employment_status]}`}>
                  {employee.employment_status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Use current employee state to populate form
                  console.log('Opening edit modal with employee data:', employee)
                  console.log('Department:', employee.department)
                  console.log('Phone:', employee.phone_number)
                  setIsEditing(true)
                  setEditForm({
                    email: employee.email || '',
                    first_name: employee.first_name || '',
                    last_name: employee.last_name || '',
                    job_title: employee.job_title || '',
                    department: employee.department || '',
                    office_location: employee.office_location || '',
                    phone_number: employee.phone_number || '',
                    extension: (employee as any).extension || '',
                    branch_name: (employee as any).branch_name || '',
                    type: (employee as any).type || '',
                    supervisor: (employee as any).supervisor || '',
                    dpt_manager: (employee as any).dpt_manager || '',
                    nick_name: (employee as any).nick_name || '',
                    username: (employee as any).username || ''
                  })
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </button>
            </div>
          </div>

          {/* Contact Info Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-center">
              <div className="bg-blue-100 rounded-lg p-3 mr-4">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-gray-600">Email</div>
                <div className="font-medium text-gray-900">{employee.email}</div>
              </div>
            </div>

            {employee.phone_number && (
              <div className="flex items-center">
                <div className="bg-green-100 rounded-lg p-3 mr-4">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Phone</div>
                  <div className="font-medium text-gray-900">{employee.phone_number}</div>
                </div>
              </div>
            )}

            {employee.department && (
              <div className="flex items-center">
                <div className="bg-purple-100 rounded-lg p-3 mr-4">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Department</div>
                  <div className="font-medium text-gray-900">{employee.department}</div>
                </div>
              </div>
            )}

            {employee.office_location && (
              <div className="flex items-center">
                <div className="bg-orange-100 rounded-lg p-3 mr-4">
                  <MapPin className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Office</div>
                  <div className="font-medium text-gray-900">{employee.office_location}</div>
                </div>
              </div>
            )}

            {employee.hire_date && (
              <div className="flex items-center">
                <div className="bg-cyan-100 rounded-lg p-3 mr-4">
                  <Calendar className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-600">Hire Date</div>
                  <div className="font-medium text-gray-900">
                    {format(new Date(employee.hire_date), 'MMM d, yyyy')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Devices</div>
                <div className="text-3xl font-bold text-gray-900">
                  {employee.devices?.length || 0}
                </div>
              </div>
              <div className="bg-blue-100 rounded-lg p-3">
                <Server className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 mb-1">Licenses</div>
                <div className="text-3xl font-bold text-gray-900">
                  {employee.license_assignments?.length || 0}
                </div>
              </div>
              <div className="bg-orange-100 rounded-lg p-3">
                <Key className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('devices')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'devices'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Devices ({employee.devices?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('licenses')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'licenses'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Licenses ({employee.license_assignments?.length || 0})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Summary</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-2">Total Devices</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {employee.devices?.length || 0}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-2">Licenses</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {employee.license_assignments?.length || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Devices Tab */}
            {activeTab === 'devices' && (
              <div className="space-y-8">
                {/* Current Devices */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Current Devices</h3>
                    <button
                      onClick={() => {
                        setNewDeviceForm({ device_name: '', device_type: '' })
                        setIsAddingDevice(true)
                      }}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Device
                    </button>
                  </div>
                  {employee.devices && employee.devices.length > 0 ? (
                    <div className="space-y-3">
                      {employee.devices.map((device: any) => (
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
                              handleRemoveDevice(device.id, device.device_name)
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
                        onClick={() => {
                          setNewDeviceForm({ device_name: '', device_type: '' })
                          setIsAddingDevice(true)
                        }}
                        className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Device
                      </button>
                    </div>
                  )}
                </div>

                {/* Previous Devices */}
                {employee.previous_devices && employee.previous_devices.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Previous Devices</h3>
                    <div className="space-y-3">
                      {employee.previous_devices.map((device: any) => (
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
            )}

            {/* Licenses Tab */}
            {activeTab === 'licenses' && (
              <div>
                {employee.license_assignments && employee.license_assignments.length > 0 ? (
                  <div className="space-y-4">
                    {employee.license_assignments.map((assignment: any) => (
                      <div key={assignment.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-gray-900">{assignment.license.software_name}</h4>
                          {assignment.revoked_date ? (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                              Revoked
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">License Type:</span>
                            <span className="ml-2 font-medium text-gray-900">{assignment.license.license_type}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Assigned:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {format(new Date(assignment.assigned_date), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                        {assignment.notes && (
                          <p className="text-sm text-gray-600 mt-2">{assignment.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Key className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No licenses assigned to this employee</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Offboard Button - Bottom of Page */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setIsOffboarding(true)}
            disabled={offboarding}
            className="inline-flex items-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {offboarding ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Offboarding...
              </>
            ) : (
              <>
                <UserMinus className="w-5 h-5 mr-2" />
                Offboard Employee
              </>
            )}
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Edit Employee Information</h2>
              <button
                onClick={() => setIsEditing(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={editForm.first_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={editForm.last_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  value={editForm.job_title || ''}
                  onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={editForm.department || ''}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Department</option>
                  <option value="Engineer">Engineer</option>
                  <option value="Operations">Operations</option>
                  <option value="Admin">Admin</option>
                  <option value="HR">HR</option>
                  <option value="Executive">Executive</option>
                  <option value="Manager">Manager</option>
                  <option value="Designer">Designer</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Office Location</label>
                <select
                  value={editForm.office_location || ''}
                  onChange={(e) => setEditForm({ ...editForm, office_location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Office</option>
                  <option value="Atlanta">Atlanta</option>
                  <option value="Chattanooga">Chattanooga</option>
                  <option value="Nashville">Nashville</option>
                  <option value="Knoxville">Knoxville</option>
                  <option value="Raleigh">Raleigh</option>
                  <option value="Charlotte">Charlotte</option>
                  <option value="Loudoun">Loudoun</option>
                  <option value="Dallas">Dallas</option>
                  <option value="Houston">Houston</option>
                  <option value="Czech">Czech</option>
                  <option value="Remote">Remote</option>
                  <option value="Florida">Florida</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone_number || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
                <input
                  type="text"
                  value={editForm.extension || ''}
                  onChange={(e) => setEditForm({ ...editForm, extension: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <select
                  value={editForm.branch_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, branch_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Branch</option>
                  <option value="Bennett & Pless Inc">B&P (Bennett & Pless Inc)</option>
                  <option value="Bennett & Pless Leicht, LLC">BPL (Bennett & Pless Leicht, LLC)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={editForm.type || ''}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Type</option>
                  <option value="Employee">Employee</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
                <input
                  type="text"
                  value={editForm.supervisor || ''}
                  onChange={(e) => setEditForm({ ...editForm, supervisor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Manager</label>
                <input
                  type="text"
                  value={editForm.dpt_manager || ''}
                  onChange={(e) => setEditForm({ ...editForm, dpt_manager: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nick Name</label>
                <input
                  type="text"
                  value={editForm.nick_name || ''}
                  onChange={(e) => setEditForm({ ...editForm, nick_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={editForm.username || ''}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Device Modal */}
      {isAddingDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Add Device</h2>
              <button
                onClick={() => setIsAddingDevice(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={addingDevice}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newDeviceForm.device_name}
                  onChange={(e) => setNewDeviceForm({ ...newDeviceForm, device_name: e.target.value })}
                  placeholder="e.g., ATL-013274415057"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={addingDevice}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Type (optional)
                </label>
                <input
                  type="text"
                  value={newDeviceForm.device_type}
                  onChange={(e) => setNewDeviceForm({ ...newDeviceForm, device_type: e.target.value })}
                  placeholder="e.g., Workstation, Laptop"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={addingDevice}
                />
                <p className="text-xs text-gray-500 mt-1">
                  If not provided, will be determined when matched with NinjaOne
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-4 mt-6">
              {addingDevice && !newDeviceForm.device_name.trim() ? (
                <div className="flex items-center text-gray-600 w-full justify-center py-2">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin text-blue-600" />
                  <span className="font-medium">Syncing with NinjaOne...</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (!addingDevice) {
                        setIsAddingDevice(false)
                        setNewDeviceForm({ device_name: '', device_type: '' })
                      }
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    disabled={addingDevice}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddDevice}
                    disabled={addingDevice || !newDeviceForm.device_name.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                  >
                    {addingDevice ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Device
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Offboard Confirmation Modal */}
      {isOffboarding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">
              Offboard Employee
            </h2>
            <p className="text-gray-700 mb-6 text-center">
              Are you sure you want to offboard <strong>{employee?.display_name || employee?.email}</strong>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800 font-semibold mb-2">This action will:</p>
              <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>Delete the employee from the database</li>
                <li>Delete the employee from the Excel sheet</li>
                <li>Unassign all devices (devices will remain in the database)</li>
              </ul>
              <p className="text-sm text-yellow-800 font-semibold mt-3">This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setIsOffboarding(false)}
                disabled={offboarding}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleOffboard}
                disabled={offboarding}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {offboarding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Offboarding...
                  </>
                ) : (
                  <>
                    <UserMinus className="w-4 h-4 mr-2" />
                    Confirm Offboard
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


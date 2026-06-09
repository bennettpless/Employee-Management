'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { 
  ArrowLeft, User, Mail, Phone, Briefcase, MapPin, Calendar, 
  Server, Loader2, Home, Edit, UserMinus
} from 'lucide-react'
import { EmployeeWithRelations } from '@/lib/types'
import { format } from 'date-fns'
import EditEmployeeModal from '@/components/employee-detail/EditEmployeeModal'
import AddDeviceModal from '@/components/employee-detail/AddDeviceModal'
import OffboardModal from '@/components/employee-detail/OffboardModal'
import EmployeeDevicesTab from '@/components/employee-detail/EmployeeDevicesTab'

export default function EmployeeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [employee, setEmployee] = useState<EmployeeWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'devices'>('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [isOffboarding, setIsOffboarding] = useState(false)
  const [offboarding, setOffboarding] = useState(false)
  const [isAddingDevice, setIsAddingDevice] = useState(false)
  const [addingDevice, setAddingDevice] = useState(false)
  const [removingDevice, setRemovingDevice] = useState<string | null>(null)
  const [newDeviceForm, setNewDeviceForm] = useState({ device_name: '', device_type: '' })
  const lastUpdateTimeRef = useRef<number>(0)

  useEffect(() => {
    if (params.id) {
      fetchEmployee(params.id as string)
    }
  }, [params.id])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && params.id) {
        setTimeout(() => {
          fetchEmployee(params.id as string, false)
        }, 100)
      }
    }

    const handleFocus = () => {
      if (params.id) {
        fetchEmployee(params.id as string, false)
      }
    }

    const handlePageshow = (e: PageTransitionEvent) => {
      if (e.persisted && params.id) {
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
      const timestamp = Date.now()
      const random = Math.random()
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
      
      if (data.employee) {
        // Skip GET state update if we recently updated from a PUT response
        // to prevent stale data from overwriting fresh changes
        const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current
        if (timeSinceLastUpdate < 5000) {
          return
        }
        
        const apiUpdatedAt = data.employee.updated_at ? new Date(data.employee.updated_at).getTime() : 0
        const currentUpdatedAt = employee?.updated_at ? new Date(employee.updated_at).getTime() : 0
        
        if (!employee || apiUpdatedAt >= currentUpdatedAt) {
          const newEmployee = JSON.parse(JSON.stringify(data.employee))
          setEmployee(newEmployee)
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
      
      setIsEditing(false)
      await fetchEmployee(employee.id)
      
      if (data.employee) {
        const newEmployee = JSON.parse(JSON.stringify({
          ...employee,
          ...data.employee,
          devices: employee.devices || [],
          previous_devices: employee.previous_devices || [],
          manager: (employee as any).manager || null
        }))
        
        setEmployee(newEmployee)
        lastUpdateTimeRef.current = Date.now()
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
      
      await fetchEmployee(employee.id)
      setNewDeviceForm({ device_name: '', device_type: '' })
      
      const syncStartTime = Date.now()
      let attempts = 0
      const maxAttempts = 120
      let pollingStopped = false
      
      const checkNinjaSync = async (): Promise<void> => {
        if (pollingStopped) return
        
        attempts++
        if (attempts > maxAttempts) {
          pollingStopped = true
          setAddingDevice(false)
          setNewDeviceForm({ device_name: '', device_type: '' })
          setIsAddingDevice(false)
          alert(`Device "${deviceName}" added successfully! NinjaOne sync is still running in the background.`)
          return
        }
        
        try {
          const logsResponse = await fetch(`/api/sync/logs?t=${Date.now()}`, {
            cache: 'no-store'
          })
          const logsData = await logsResponse.json()
          const logs = logsData.logs || []
          
          const ninjaLogs = logs.filter((log: any) => log.sync_type === 'ninjaone')
          const latestNinjaLog = ninjaLogs.length > 0 ? ninjaLogs[0] : null
          
          if (latestNinjaLog) {
            const logStartTime = new Date(latestNinjaLog.started_at).getTime()
            const isRecentSync = logStartTime >= syncStartTime - 5000
            
            if (isRecentSync) {
              const completedAt = latestNinjaLog.completed_at
              const status = latestNinjaLog.status
              
              const isCompleted = completedAt && 
                                 completedAt !== null && 
                                 completedAt !== '' &&
                                 String(completedAt).trim() !== '' &&
                                 (status === 'success' || status === 'partial' || status === 'failed')
              
              if (isCompleted) {
                pollingStopped = true
                setAddingDevice(false)
                setNewDeviceForm({ device_name: '', device_type: '' })
                setIsAddingDevice(false)
                alert(`Device "${deviceName}" added successfully! NinjaOne sync completed.`)
                await fetchEmployee(employee.id)
                return
              }
            }
          }
          
          setTimeout(() => {
            if (!pollingStopped) {
              checkNinjaSync()
            }
          }, 1000)
        } catch (error) {
          console.error('Error checking NinjaOne sync status:', error)
          setTimeout(() => {
            if (!pollingStopped) {
              checkNinjaSync()
            }
          }, 1000)
        }
      }
      
      setTimeout(() => {
        if (!pollingStopped) {
          checkNinjaSync()
        }
      }, 2000)
      
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
      
      await fetchEmployee(employee.id)
      alert(`Device "${deviceName}" removed successfully!`)
    } catch (error: any) {
      console.error('Error removing device:', error)
      alert(`Error removing device: ${error.message}`)
    } finally {
      setRemovingDevice(null)
    }
  }

  const openEditModal = () => {
    setIsEditing(true)
    setEditForm({
      email: employee?.email || '',
      first_name: employee?.first_name || '',
      last_name: employee?.last_name || '',
      job_title: employee?.job_title || '',
      department: employee?.department || '',
      office_location: employee?.office_location || '',
      phone_number: employee?.phone_number || '',
      extension: (employee as any)?.extension || '',
      branch_name: (employee as any)?.branch_name || '',
      type: (employee as any)?.type || '',
      supervisor: (employee as any)?.supervisor || '',
      dpt_manager: (employee as any)?.dpt_manager || '',
      nick_name: (employee as any)?.nick_name || '',
      username: (employee as any)?.username || ''
    })
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
                onClick={openEditModal}
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
            </nav>
          </div>

          <div className="p-6">
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
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'devices' && (
              <EmployeeDevicesTab
                devices={employee.devices || []}
                previousDevices={employee.previous_devices || []}
                removingDevice={removingDevice}
                onOpenAddDevice={() => {
                  setNewDeviceForm({ device_name: '', device_type: '' })
                  setIsAddingDevice(true)
                }}
                onRemoveDevice={handleRemoveDevice}
              />
            )}
          </div>
        </div>

        {/* Offboard Button */}
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

      {/* Modals */}
      {isEditing && (
        <EditEmployeeModal
          editForm={editForm}
          setEditForm={setEditForm}
          saving={saving}
          onSave={handleSave}
          onClose={() => setIsEditing(false)}
        />
      )}

      {isAddingDevice && (
        <AddDeviceModal
          newDeviceForm={newDeviceForm}
          setNewDeviceForm={setNewDeviceForm}
          addingDevice={addingDevice}
          onAddDevice={handleAddDevice}
          onClose={() => {
            setIsAddingDevice(false)
            setNewDeviceForm({ device_name: '', device_type: '' })
          }}
        />
      )}

      {isOffboarding && (
        <OffboardModal
          employeeName={employee.display_name || employee.email}
          offboarding={offboarding}
          onConfirm={handleOffboard}
          onClose={() => setIsOffboarding(false)}
        />
      )}
    </div>
  )
}

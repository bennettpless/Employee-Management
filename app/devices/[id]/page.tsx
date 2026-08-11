'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Server, Monitor, Laptop, Tv, Printer, Loader2, HardDrive,
  User, Calendar, Building, Home, Pencil, Trash2, Plus, Wrench, ArrowUpCircle, StickyNote, MapPin, Tag, ShieldCheck,
} from 'lucide-react'
import { format } from 'date-fns'
import { Device, DeviceHistoryEntry } from '@/lib/types'
import { ASSET_TYPE_LABELS, DEVICE_STATUS_LABELS, formatMakeModel } from '@/lib/devices'
import DeviceFormModal from '@/components/devices/DeviceFormModal'

interface AssignmentUser {
  employee: {
    id: string
    display_name: string | null
    email: string
    first_name: string | null
    last_name: string | null
  }
  assignment_date: string
  unassignment_date?: string | null
  registered_date?: string
}

interface DeviceWithRelations extends Device {
  history: DeviceHistoryEntry[]
  current_users?: AssignmentUser[]
  previous_users?: AssignmentUser[]
}

const statusBadgeClass: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  in_stock: 'bg-blue-100 text-blue-800 border-blue-200',
  repair: 'bg-amber-100 text-amber-800 border-amber-200',
  decommissioned: 'bg-gray-200 text-gray-700 border-gray-300',
}

const eventTypeMeta: Record<string, { label: string; icon: JSX.Element; badge: string }> = {
  repair: { label: 'Repair', icon: <Wrench className="w-4 h-4" />, badge: 'bg-orange-100 text-orange-800' },
  upgrade: { label: 'Upgrade', icon: <ArrowUpCircle className="w-4 h-4" />, badge: 'bg-blue-100 text-blue-800' },
  note: { label: 'Note', icon: <StickyNote className="w-4 h-4" />, badge: 'bg-gray-100 text-gray-700' },
}

function getDeviceIcon(assetType: string | null) {
  switch (assetType) {
    case 'laptop': return <Laptop className="w-8 h-8 text-blue-600" />
    case 'desktop': return <Monitor className="w-8 h-8 text-indigo-600" />
    case 'monitor': return <Monitor className="w-8 h-8 text-cyan-600" />
    case 'tv': return <Tv className="w-8 h-8 text-purple-600" />
    case 'printer': return <Printer className="w-8 h-8 text-orange-600" />
    case 'server': return <Server className="w-8 h-8 text-red-600" />
    default: return <HardDrive className="w-8 h-8 text-gray-500" />
  }
}

function fmtDate(iso: string | null | undefined, withTime = false): string | null {
  if (!iso) return null
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return format(date, withTime ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy')
}

export default function DeviceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [device, setDevice] = useState<DeviceWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [historyForm, setHistoryForm] = useState({ event_type: 'repair', event_date: '', description: '' })
  const [addingHistory, setAddingHistory] = useState(false)
  const [removingEntry, setRemovingEntry] = useState<string | null>(null)

  const fetchDevice = useCallback(async (id: string) => {
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
  }, [])

  useEffect(() => {
    if (params.id) {
      fetchDevice(params.id as string)
    }
  }, [params.id, fetchDevice])

  const handleDelete = async () => {
    if (!device || deleting) return
    if (!confirm(`Delete this device (${device.asset_tag || device.device_name || device.serial_number || 'unnamed'})? This also removes its history.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/devices/${device.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete device')
      }
      router.push('/devices')
    } catch (e: any) {
      alert(e.message)
      setDeleting(false)
    }
  }

  const handleAddHistory = async () => {
    if (!device || addingHistory || !historyForm.description.trim()) return
    setAddingHistory(true)
    try {
      const res = await fetch(`/api/devices/${device.id}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historyForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add entry')
      setHistoryForm({ event_type: 'repair', event_date: '', description: '' })
      await fetchDevice(device.id)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAddingHistory(false)
    }
  }

  const handleRemoveEntry = async (entryId: string) => {
    if (!device || removingEntry) return
    if (!confirm('Remove this history entry?')) return
    setRemovingEntry(entryId)
    try {
      const res = await fetch(`/api/devices/${device.id}/history?entry_id=${entryId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove entry')
      }
      await fetchDevice(device.id)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setRemovingEntry(null)
    }
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

  const title =
    device.device_name ||
    device.asset_tag ||
    formatMakeModel(device.manufacturer, device.model) ||
    'Device'

  const detailFields: Array<{ label: string; value: string | null; icon: JSX.Element; mono?: boolean }> = [
    { label: 'Device Name', value: device.device_name, icon: <Monitor className="w-5 h-5 text-sky-600" />, mono: true },
    { label: 'Make / Manufacturer', value: device.manufacturer, icon: <Building className="w-5 h-5 text-blue-600" /> },
    { label: 'Model', value: device.model, icon: <Server className="w-5 h-5 text-purple-600" /> },
    { label: 'Serial Number', value: device.serial_number, icon: <HardDrive className="w-5 h-5 text-orange-600" />, mono: true },
    { label: 'Asset Tag', value: device.asset_tag, icon: <Tag className="w-5 h-5 text-teal-600" />, mono: true },
    { label: 'Department', value: device.department, icon: <Building className="w-5 h-5 text-indigo-600" /> },
    { label: 'Location', value: device.location, icon: <MapPin className="w-5 h-5 text-rose-600" /> },
    { label: 'Commission Date', value: fmtDate(device.commissioned_at), icon: <Calendar className="w-5 h-5 text-green-600" /> },
    { label: 'Decommission Date', value: fmtDate(device.decommissioned_at), icon: <Calendar className="w-5 h-5 text-gray-600" /> },
    {
      label: 'Warranty',
      value: device.warranty_months || device.warranty_end
        ? [
            device.warranty_months ? `${device.warranty_months} months` : null,
            device.warranty_end ? `ends ${fmtDate(device.warranty_end)}` : null,
          ].filter(Boolean).join(', ')
        : null,
      icon: <ShieldCheck className="w-5 h-5 text-cyan-600" />,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/devices"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Devices
          </Link>
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
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center">
              <div className="bg-blue-100 rounded-lg p-4 mr-6">
                {getDeviceIcon(device.asset_type)}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
                <p className="text-lg text-gray-600 mb-3">
                  {device.asset_type ? ASSET_TYPE_LABELS[device.asset_type] : device.device_type || 'Unknown type'}
                </p>
                <span className={`px-4 py-1 rounded-full text-sm font-semibold border ${statusBadgeClass[device.status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                  {DEVICE_STATUS_LABELS[device.status] || device.status}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>

          {/* Assigned user */}
          <div className="mb-6 pb-6 border-b border-gray-200 flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Assigned User</div>
              <div className="font-medium text-gray-900">
                {device.employee
                  ? `${device.employee.display_name || device.employee.email}${device.employee.email && device.employee.display_name ? ` (${device.employee.email})` : ''}`
                  : 'Unassigned'}
              </div>
            </div>
          </div>

          {/* Device Details Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {detailFields.filter((f) => f.value).map((f) => (
              <div key={f.label} className="flex items-center">
                <div className="bg-gray-100 rounded-lg p-3 mr-4">{f.icon}</div>
                <div>
                  <div className="text-sm text-gray-600">{f.label}</div>
                  <div className={`font-medium text-gray-900 ${f.mono ? 'font-mono text-sm' : ''}`}>{f.value}</div>
                </div>
              </div>
            ))}
          </div>

          {device.notes && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Notes</div>
              <p className="text-gray-900 whitespace-pre-wrap">{device.notes}</p>
            </div>
          )}
        </div>

        {/* Repair / Upgrade History */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900">Repair / Upgrade History</h2>
          </div>
          <div className="p-6">
            {/* Add entry form */}
            <div className="flex flex-wrap items-end gap-3 mb-6 bg-gray-50 rounded-lg p-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={historyForm.event_type}
                  onChange={(e) => setHistoryForm({ ...historyForm, event_type: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  disabled={addingHistory}
                >
                  <option value="repair">Repair</option>
                  <option value="upgrade">Upgrade</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={historyForm.event_date}
                  onChange={(e) => setHistoryForm({ ...historyForm, event_date: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={addingHistory}
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={historyForm.description}
                  onChange={(e) => setHistoryForm({ ...historyForm, description: e.target.value })}
                  placeholder="e.g., Replaced battery, upgraded RAM to 32GB..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={addingHistory}
                />
              </div>
              <button
                onClick={handleAddHistory}
                disabled={addingHistory || !historyForm.description.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {addingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Entry
              </button>
            </div>

            {device.history.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No repairs or upgrades recorded for this device</p>
            ) : (
              <div className="space-y-3">
                {device.history.map((entry) => {
                  const meta = eventTypeMeta[entry.event_type] || eventTypeMeta.note
                  return (
                    <div key={entry.id} className="flex items-start justify-between border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${meta.badge}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                        <div>
                          <p className="text-gray-900">{entry.description}</p>
                          <p className="text-xs text-gray-500 mt-1">{fmtDate(entry.event_date)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveEntry(entry.id)}
                        disabled={removingEntry === entry.id}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove entry"
                      >
                        {removingEntry === entry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Assignment history */}
        {((device.current_users && device.current_users.length > 0) || (device.previous_users && device.previous_users.length > 0)) && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-2xl font-bold text-gray-900">Assignment History</h2>
            </div>

            <div className="p-6 space-y-6">
              {device.current_users && device.current_users.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Current</h3>
                  <div className="space-y-3">
                    {device.current_users.map((assignment, idx) => (
                      <div
                        key={assignment.employee.id || idx}
                        className="flex items-center justify-between border border-gray-200 rounded-lg p-4"
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
                            <div>Assigned: {fmtDate(assignment.assignment_date)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {device.previous_users && device.previous_users.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Previous</h3>
                  <div className="space-y-3">
                    {device.previous_users.map((assignment, idx) => (
                      <div
                        key={`${assignment.employee.id}-${idx}`}
                        className="flex items-center justify-between border border-gray-200 rounded-lg p-4 opacity-75"
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
                            <div>Assigned: {fmtDate(assignment.assignment_date)}</div>
                          )}
                          {assignment.unassignment_date && (
                            <div>Unassigned: {fmtDate(assignment.unassignment_date)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showEditModal && (
        <DeviceFormModal
          device={device}
          onSaved={() => {
            setShowEditModal(false)
            fetchDevice(device.id)
          }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  )
}

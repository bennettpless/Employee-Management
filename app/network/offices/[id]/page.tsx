'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  Building2,
  Plus,
  Loader2,
  Edit2,
  MapPin,
  Download,
  Upload,
} from 'lucide-react'
import NetworkDeviceTable from '@/components/network/NetworkDeviceTable'
import NetworkDeviceForm, {
  EMPTY_DEVICE_FORM,
  deviceToForm,
  formToBody,
  type NetworkDeviceFormState,
} from '@/components/network/NetworkDeviceForm'
import type { NetworkDevice, Office } from '@/lib/types'

// React Flow ships its own CSS and uses `window`/`document` extensively, so
// load the topology component on the client only — matches the same pattern
// used for the Leaflet `OfficeMap` on the network dashboard.
const OfficeTopology = dynamic(
  () => import('@/components/network/OfficeTopology'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] bg-gray-100 animate-pulse rounded-xl shadow-md" />
    ),
  }
)

interface OfficeWithDeviceCount extends Office {
  device_count?: number
}

export default function OfficeNetworkPage() {
  const params = useParams()
  const officeId = params?.id as string
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [office, setOffice] = useState<OfficeWithDeviceCount | null>(null)
  const [devices, setDevices] = useState<NetworkDevice[]>([])
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NetworkDeviceFormState>(EMPTY_DEVICE_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    if (!officeId) return
    setLoading(true)
    setError(null)
    try {
      const [officeRes, devicesRes, officesRes] = await Promise.all([
        fetch(`/api/network/offices/${officeId}`),
        fetch(`/api/network/devices?office_id=${officeId}`),
        fetch(`/api/network/offices`),
      ])
      const officeData = await officeRes.json()
      const devicesData = await devicesRes.json()
      const officesData = await officesRes.json()
      if (!officeRes.ok) {
        throw new Error(officeData.error || 'Office not found')
      }
      if (!devicesRes.ok) {
        throw new Error(devicesData.error || 'Failed to load devices')
      }
      setOffice(officeData.office)
      setDevices(devicesData.devices ?? [])
      setOffices(officesData.offices ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [officeId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openCreate = () => {
    setModalMode('create')
    setEditingId(null)
    setForm({ ...EMPTY_DEVICE_FORM, office_id: officeId })
    setSaveError(null)
    setModalOpen(true)
  }

  const openEdit = (device: NetworkDevice) => {
    setModalMode('edit')
    setEditingId(device.id)
    setForm(deviceToForm(device))
    setSaveError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const url =
        modalMode === 'create'
          ? '/api/network/devices'
          : `/api/network/devices/${editingId}`
      const method = modalMode === 'create' ? 'POST' : 'PATCH'
      const body = formToBody(form)

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          modalMode === 'create' ? { ...body, source: 'manual' } : body
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save device')
        return
      }
      setModalOpen(false)
      await loadAll()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (device: NetworkDevice) => {
    if (
      !confirm(
        `Delete network device "${device.name}"? This will also remove its topology connections. This cannot be undone.`
      )
    ) {
      return
    }
    setDeletingId(device.id)
    try {
      const res = await fetch(`/api/network/devices/${device.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to delete device')
        return
      }
      await loadAll()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete device')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (error || !office) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/network"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Network
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-600">{error || 'Office not found.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const addressLine = [
    office.address_line1,
    office.address_line2,
    [office.city, office.state, office.postal_code]
      .filter(Boolean)
      .join(', '),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/network"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Network
        </Link>

        {/* Office header card */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1 flex items-center gap-3">
                <Building2 className="w-7 h-7 text-blue-600" />
                {office.name}
              </h1>
              {addressLine && (
                <p className="text-sm text-gray-600 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {addressLine}
                </p>
              )}
              {office.latitude != null && office.longitude != null && (
                <p className="text-xs text-gray-500 font-mono mt-1">
                  {Number(office.latitude).toFixed(4)},{' '}
                  {Number(office.longitude).toFixed(4)}
                </p>
              )}
            </div>
            {isAdmin && (
              <Link
                href="/settings/offices"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit Office
              </Link>
            )}
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-2xl font-bold text-gray-900">
            Devices
            <span className="ml-2 text-base font-normal text-gray-500">
              ({devices.length})
            </span>
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/network/import"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </Link>
            <button
              disabled
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
              title="Available in Phase 18"
            >
              <Download className="w-4 h-4" />
              Export office
            </button>
            {isAdmin && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Device
              </button>
            )}
          </div>
        </div>

        <NetworkDeviceTable
          devices={devices}
          canEdit={isAdmin}
          onEdit={openEdit}
          onDelete={handleDelete}
          deletingId={deletingId}
        />

        {/* Topology diagram */}
        <div className="mt-8">
          <OfficeTopology
            officeId={officeId}
            officeName={office.name}
            canEdit={isAdmin}
          />
        </div>
      </div>

      {modalOpen && (
        <NetworkDeviceForm
          mode={modalMode}
          form={form}
          setForm={setForm}
          offices={offices}
          preselectedOfficeId={officeId}
          saving={saving}
          errorMessage={saveError}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

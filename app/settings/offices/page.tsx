'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft,
  Building2,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  ShieldOff,
  AlertTriangle,
} from 'lucide-react'
import OfficeFormModal, {
  EMPTY_OFFICE_FORM,
  officeToForm,
  type OfficeFormState,
} from '@/components/offices/OfficeFormModal'
import type { Office } from '@/lib/types'

interface OfficeWithDeviceCount extends Office {
  device_count?: number
}

function formToBody(form: OfficeFormState) {
  return {
    name: form.name.trim(),
    address_line1: form.address_line1.trim() || null,
    address_line2: form.address_line2.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    postal_code: form.postal_code.trim() || null,
    country: form.country.trim() || null,
    latitude: form.latitude.trim() === '' ? null : Number(form.latitude),
    longitude: form.longitude.trim() === '' ? null : Number(form.longitude),
    auvik_network_id: form.auvik_network_id.trim() || null,
    notes: form.notes.trim() || null,
  }
}

export default function OfficesAdminPage() {
  const { data: session, status: sessionStatus } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [offices, setOffices] = useState<OfficeWithDeviceCount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<OfficeFormState>(EMPTY_OFFICE_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadOffices = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/network/offices')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load offices')
      setOffices(data.offices || [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load offices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === 'authenticated' && isAdmin) {
      loadOffices()
    }
  }, [sessionStatus, isAdmin, loadOffices])

  const openCreate = () => {
    setModalMode('create')
    setEditingId(null)
    setForm(EMPTY_OFFICE_FORM)
    setSaveError(null)
    setModalOpen(true)
  }

  const openEdit = (office: OfficeWithDeviceCount) => {
    setModalMode('edit')
    setEditingId(office.id)
    setForm(officeToForm(office))
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
          ? '/api/network/offices'
          : `/api/network/offices/${editingId}`
      const method = modalMode === 'create' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save office')
        return
      }

      setModalOpen(false)
      await loadOffices()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save office')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (office: OfficeWithDeviceCount) => {
    const deviceCount = office.device_count || 0
    const warning =
      deviceCount > 0
        ? `This office has ${deviceCount} device${deviceCount === 1 ? '' : 's'} assigned. Those devices will become unassigned (office_id set to NULL). `
        : ''
    if (!confirm(`${warning}Delete office "${office.name}"? This cannot be undone.`)) {
      return
    }

    setDeletingId(office.id)
    try {
      const res = await fetch(`/api/network/offices/${office.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to delete office')
        return
      }
      await loadOffices()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete office')
    } finally {
      setDeletingId(null)
    }
  }

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8">
          <Link
            href="/settings"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings
          </Link>
          <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl mx-auto border-l-4 border-amber-500">
            <div className="flex items-start">
              <ShieldOff className="w-6 h-6 text-amber-500 mr-3 flex-shrink-0 mt-1" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Admin role required
                </h2>
                <p className="text-gray-600">
                  Office management is restricted to administrators. Contact IT
                  if you need access.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Settings
          </Link>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Building2 className="w-8 h-8 text-blue-600" />
                Office Management
              </h1>
              <p className="text-gray-600">
                Manage the physical office locations used by the Network feature.
              </p>
            </div>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Office
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium">Failed to load offices</p>
              <p>{loadError}</p>
              <button
                onClick={loadOffices}
                className="mt-2 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : offices.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No offices yet.</p>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add your first office
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">City / State</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Lat / Lng</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Auvik Network ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Devices</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {offices.map((office) => (
                    <tr key={office.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{office.name}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {[office.city, office.state].filter(Boolean).join(', ') || (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                        {office.latitude != null && office.longitude != null ? (
                          `${Number(office.latitude).toFixed(4)}, ${Number(office.longitude).toFixed(4)}`
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                        {office.auvik_network_id || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {office.device_count ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(office)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit office"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(office)}
                            disabled={deletingId === office.id}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Delete office"
                          >
                            {deletingId === office.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <OfficeFormModal
          mode={modalMode}
          form={form}
          setForm={setForm}
          saving={saving}
          errorMessage={saveError}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

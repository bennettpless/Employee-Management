'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  ArrowLeft,
  Building2,
  Edit2,
  Trash2,
  Loader2,
  ExternalLink,
  Info,
  CheckCircle2,
} from 'lucide-react'
import NetworkDeviceForm, {
  deviceToForm,
  formToBody,
  type NetworkDeviceFormState,
  EMPTY_DEVICE_FORM,
} from '@/components/network/NetworkDeviceForm'
import {
  DeviceTypeIcon,
  DEVICE_TYPE_LABEL,
  STATUS_BADGE_CLASS,
} from '@/components/network/NetworkDeviceTable'
import type {
  NetworkDevice,
  NetworkDeviceConnection,
  Office,
} from '@/lib/types'

interface ConnectionWithPeer extends NetworkDeviceConnection {
  source?: { id: string; name: string; device_type: string } | null
  target?: { id: string; name: string; device_type: string } | null
}

interface DeviceDetail extends NetworkDevice {
  outgoing_connections?: ConnectionWithPeer[]
  incoming_connections?: ConnectionWithPeer[]
}

export default function NetworkDeviceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [device, setDevice] = useState<DeviceDetail | null>(null)
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<NetworkDeviceFormState>(EMPTY_DEVICE_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadDevice = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [devRes, officesRes] = await Promise.all([
        fetch(`/api/network/devices/${id}`),
        fetch('/api/network/offices'),
      ])
      const devData = await devRes.json()
      const officesData = await officesRes.json()
      if (!devRes.ok) {
        throw new Error(devData.error || 'Device not found')
      }
      setDevice(devData.device)
      setOffices(officesData.offices ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load device')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadDevice()
  }, [loadDevice])

  const openEdit = () => {
    if (!device) return
    setForm(deviceToForm(device))
    setSaveError(null)
    setEditing(true)
  }

  const closeEdit = () => {
    if (saving) return
    setEditing(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!device) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/network/devices/${device.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(form)),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save device')
        return
      }
      setEditing(false)
      await loadDevice()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save device')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!device) return
    if (
      !confirm(
        `Delete network device "${device.name}"? This will also remove its topology connections. This cannot be undone.`
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/network/devices/${device.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to delete device')
        setDeleting(false)
        return
      }
      if (device.office_id) {
        router.push(`/network/offices/${device.office_id}`)
      } else {
        router.push('/network')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete device')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (error || !device) {
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
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Device not found
            </h2>
            <p className="text-gray-600">{error || ''}</p>
          </div>
        </div>
      </div>
    )
  }

  const allConnections = [
    ...(device.outgoing_connections ?? []).map((c) => ({
      ...c,
      direction: 'outgoing' as const,
    })),
    ...(device.incoming_connections ?? []).map((c) => ({
      ...c,
      direction: 'incoming' as const,
    })),
  ]

  const backLink = device.office_id
    ? `/network/offices/${device.office_id}`
    : '/network'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <Link
          href={backLink}
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {device.office ? `Back to ${device.office.name}` : 'Back to Network'}
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-start gap-4">
              <div className="bg-blue-100 rounded-lg p-3 mt-1">
                <DeviceTypeIcon
                  type={device.device_type}
                  className="w-7 h-7 text-blue-600"
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-1">
                  {device.name}
                </h1>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-600">
                    {DEVICE_TYPE_LABEL[device.device_type]}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_BADGE_CLASS[device.status]}`}
                  >
                    {device.status}
                  </span>
                  <span className="text-xs text-gray-500 inline-flex items-center gap-1 capitalize">
                    Source: <strong>{device.source}</strong>
                    {device.is_manually_overridden && (
                      <span
                        className="text-blue-600"
                        title="Manual override is on — Auvik sync will skip this device"
                      >
                        ● override
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {device.management_url && (
                <a
                  href={device.management_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open
                </a>
              )}
              {device.auvik_device_id &&
                process.env.NEXT_PUBLIC_AUVIK_DEVICE_BASE_URL && (
                  <a
                    href={`${process.env.NEXT_PUBLIC_AUVIK_DEVICE_BASE_URL}${device.auvik_device_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View in Auvik
                  </a>
                )}
              {isAdmin && (
                <>
                  <button
                    onClick={openEdit}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {device.source === 'auvik' && !device.is_manually_overridden && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                Auvik-synced device. Hand-edits will be overwritten by the
                next sync unless you enable <strong>Manual override</strong>{' '}
                in Edit mode.
              </div>
            </div>
          )}

          {device.source === 'manual' && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Manually entered device — fully editable.
            </div>
          )}
        </div>

        {/* Details grid */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
          <dl className="grid md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <Field label="Office">
              {device.office ? (
                <Link
                  href={`/network/offices/${device.office.id}`}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
                >
                  <Building2 className="w-4 h-4" />
                  {device.office.name}
                </Link>
              ) : (
                <span className="text-gray-400">— (unassigned)</span>
              )}
            </Field>
            <Field label="Manufacturer">{device.manufacturer || '—'}</Field>
            <Field label="Model">{device.model || '—'}</Field>
            <Field label="Serial Number" mono>
              {device.serial_number || '—'}
            </Field>
            <Field label="Firmware Version" mono>
              {device.firmware_version || '—'}
            </Field>
            <Field label="MAC Address" mono>
              {device.mac_address || '—'}
            </Field>
            <Field label="Management IP" mono>
              {device.management_ip || '—'}
            </Field>
            <Field label="Management URL">
              {device.management_url ? (
                <a
                  href={device.management_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 break-all"
                >
                  {device.management_url}
                </a>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Last Seen">
              {device.last_seen
                ? new Date(device.last_seen).toLocaleString()
                : '—'}
            </Field>
            <Field label="Last Auvik Sync">
              {device.last_synced_at
                ? new Date(device.last_synced_at).toLocaleString()
                : '—'}
            </Field>
            <Field label="Credentials Vault Ref" wide>
              {device.credentials_vault_ref || '—'}
            </Field>
            <Field label="Notes" wide>
              {device.notes ? (
                <p className="whitespace-pre-wrap">{device.notes}</p>
              ) : (
                '—'
              )}
            </Field>
          </dl>
        </div>

        {/* Connections */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Connections
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({allConnections.length})
              </span>
            </h2>
            <span className="text-xs text-gray-500">
              Edit connections in the topology view (Phase 16).
            </span>
          </div>

          {allConnections.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No connections recorded for this device.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 font-medium">Direction</th>
                    <th className="text-left py-2 font-medium">Peer Device</th>
                    <th className="text-left py-2 font-medium">Local Port</th>
                    <th className="text-left py-2 font-medium">Peer Port</th>
                    <th className="text-left py-2 font-medium">Link Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allConnections.map((c) => {
                    const peer = c.direction === 'outgoing' ? c.target : c.source
                    const localPort =
                      c.direction === 'outgoing' ? c.source_port : c.target_port
                    const peerPort =
                      c.direction === 'outgoing' ? c.target_port : c.source_port
                    return (
                      <tr key={c.id}>
                        <td className="py-2 text-gray-600 capitalize">
                          {c.direction}
                        </td>
                        <td className="py-2">
                          {peer ? (
                            <Link
                              href={`/network/devices/${peer.id}`}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {peer.name}
                            </Link>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 font-mono text-xs text-gray-700">
                          {localPort || '—'}
                        </td>
                        <td className="py-2 font-mono text-xs text-gray-700">
                          {peerPort || '—'}
                        </td>
                        <td className="py-2 text-gray-700 capitalize">
                          {c.link_type || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <NetworkDeviceForm
          mode="edit"
          form={form}
          setForm={setForm}
          offices={offices}
          showAuvikNotice={device.source === 'auvik'}
          saving={saving}
          errorMessage={saveError}
          onSave={handleSave}
          onClose={closeEdit}
        />
      )}
    </div>
  )
}

function Field({
  label,
  children,
  mono = false,
  wide = false,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
  wide?: boolean
}) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </dt>
      <dd
        className={`text-gray-900 ${
          mono ? 'font-mono text-xs' : ''
        }`}
      >
        {children}
      </dd>
    </div>
  )
}

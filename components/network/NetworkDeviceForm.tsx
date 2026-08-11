'use client'

import { Loader2, X, Save } from 'lucide-react'
import type {
  NetworkDevice,
  NetworkDeviceStatus,
  NetworkDeviceType,
  Office,
} from '@/lib/types'

export interface NetworkDeviceFormState {
  name: string
  device_type: NetworkDeviceType
  office_id: string
  manufacturer: string
  model: string
  serial_number: string
  firmware_version: string
  management_ip: string
  management_url: string
  mac_address: string
  status: NetworkDeviceStatus
  credentials_vault_ref: string
  notes: string
}

export const EMPTY_DEVICE_FORM: NetworkDeviceFormState = {
  name: '',
  device_type: 'switch',
  office_id: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  firmware_version: '',
  management_ip: '',
  management_url: '',
  mac_address: '',
  status: 'unknown',
  credentials_vault_ref: '',
  notes: '',
}

export function deviceToForm(device: NetworkDevice): NetworkDeviceFormState {
  return {
    name: device.name ?? '',
    device_type: device.device_type,
    office_id: device.office_id ?? '',
    manufacturer: device.manufacturer ?? '',
    model: device.model ?? '',
    serial_number: device.serial_number ?? '',
    firmware_version: device.firmware_version ?? '',
    management_ip: device.management_ip ?? '',
    management_url: device.management_url ?? '',
    mac_address: device.mac_address ?? '',
    status: device.status,
    credentials_vault_ref: device.credentials_vault_ref ?? '',
    notes: device.notes ?? '',
  }
}

export function formToBody(form: NetworkDeviceFormState) {
  return {
    name: form.name.trim(),
    device_type: form.device_type,
    office_id: form.office_id || null,
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    serial_number: form.serial_number.trim() || null,
    firmware_version: form.firmware_version.trim() || null,
    management_ip: form.management_ip.trim() || null,
    management_url: form.management_url.trim() || null,
    mac_address: form.mac_address.trim() || null,
    status: form.status,
    credentials_vault_ref: form.credentials_vault_ref.trim() || null,
    notes: form.notes.trim() || null,
  }
}

const DEVICE_TYPE_OPTIONS: { value: NetworkDeviceType; label: string }[] = [
  { value: 'access_point', label: 'Access Point' },
  { value: 'switch', label: 'Switch' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'server', label: 'Server' },
  { value: 'router', label: 'Router' },
  { value: 'other', label: 'Other' },
]

const STATUS_OPTIONS: { value: NetworkDeviceStatus; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
  { value: 'unknown', label: 'Unknown' },
]

interface NetworkDeviceFormProps {
  mode: 'create' | 'edit'
  form: NetworkDeviceFormState
  setForm: (form: NetworkDeviceFormState) => void
  offices: Pick<Office, 'id' | 'name' | 'city' | 'state'>[]
  preselectedOfficeId?: string
  saving: boolean
  errorMessage: string | null
  onSave: () => void
  onClose: () => void
}

export default function NetworkDeviceForm({
  mode,
  form,
  setForm,
  offices,
  preselectedOfficeId,
  saving,
  errorMessage,
  onSave,
  onClose,
}: NetworkDeviceFormProps) {
  const update = <K extends keyof NetworkDeviceFormState>(
    field: K,
    value: NetworkDeviceFormState[K]
  ) => setForm({ ...form, [field]: value })

  const canSubmit =
    form.name.trim().length > 0 &&
    !!form.device_type &&
    !!form.office_id

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'create' ? 'Add Network Device' : 'Edit Network Device'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={saving}
            aria-label="Close"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. ATL-SW-01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.device_type}
              onChange={(e) =>
                update('device_type', e.target.value as NetworkDeviceType)
              }
              aria-label="Device type"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {DEVICE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Office <span className="text-red-500">*</span>
            </label>
            <select
              value={form.office_id}
              onChange={(e) => update('office_id', e.target.value)}
              disabled={!!preselectedOfficeId && mode === 'create'}
              aria-label="Office"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-600"
            >
              <option value="">— Select an office —</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.city ? ` (${o.city}${o.state ? `, ${o.state}` : ''})` : ''}
                </option>
              ))}
            </select>
            {offices.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                No offices yet — add one under{' '}
                <a
                  href="/settings/offices"
                  className="underline hover:no-underline"
                >
                  Settings → Offices
                </a>
                .
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Manufacturer
            </label>
            <input
              type="text"
              value={form.manufacturer}
              onChange={(e) => update('manufacturer', e.target.value)}
              placeholder="e.g. Cisco, SonicWall"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              placeholder="e.g. Catalyst 2960"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Serial Number
            </label>
            <input
              type="text"
              value={form.serial_number}
              onChange={(e) => update('serial_number', e.target.value)}
              placeholder="e.g. SN12345"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Firmware Version
            </label>
            <input
              type="text"
              value={form.firmware_version}
              onChange={(e) => update('firmware_version', e.target.value)}
              placeholder="e.g. 15.2(7)E3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Management IP
            </label>
            <input
              type="text"
              value={form.management_ip}
              onChange={(e) => update('management_ip', e.target.value)}
              placeholder="e.g. 10.0.0.1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MAC Address
            </label>
            <input
              type="text"
              value={form.mac_address}
              onChange={(e) => update('mac_address', e.target.value)}
              placeholder="e.g. 00:11:22:33:44:55"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Management URL
            </label>
            <input
              type="text"
              value={form.management_url}
              onChange={(e) => update('management_url', e.target.value)}
              placeholder="e.g. https://10.0.0.1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) =>
                update('status', e.target.value as NetworkDeviceStatus)
              }
              aria-label="Status"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Credentials Vault Ref
            </label>
            <input
              type="text"
              value={form.credentials_vault_ref}
              onChange={(e) =>
                update('credentials_vault_ref', e.target.value)
              }
              placeholder="e.g. LastPass: Atlanta Firewall Admin"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Free-text reference only — credentials live in LastPass.
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              aria-label="Notes"
              placeholder="Optional notes about this device"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

        </div>

        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !canSubmit}
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
                {mode === 'create' ? 'Create Device' : 'Save Changes'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { Loader2, X, Save, MapPin } from 'lucide-react'
import { useState } from 'react'
import type { Office } from '@/lib/types'

export interface OfficeFormState {
  name: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
  latitude: string
  longitude: string
  auvik_network_id: string
  notes: string
}

export const EMPTY_OFFICE_FORM: OfficeFormState = {
  name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'USA',
  latitude: '',
  longitude: '',
  auvik_network_id: '',
  notes: '',
}

export function officeToForm(office: Office): OfficeFormState {
  return {
    name: office.name ?? '',
    address_line1: office.address_line1 ?? '',
    address_line2: office.address_line2 ?? '',
    city: office.city ?? '',
    state: office.state ?? '',
    postal_code: office.postal_code ?? '',
    country: office.country ?? 'USA',
    latitude: office.latitude == null ? '' : String(office.latitude),
    longitude: office.longitude == null ? '' : String(office.longitude),
    auvik_network_id: office.auvik_network_id ?? '',
    notes: office.notes ?? '',
  }
}

interface OfficeFormModalProps {
  mode: 'create' | 'edit'
  form: OfficeFormState
  setForm: (form: OfficeFormState) => void
  saving: boolean
  errorMessage: string | null
  onSave: () => void
  onClose: () => void
}

export default function OfficeFormModal({
  mode,
  form,
  setForm,
  saving,
  errorMessage,
  onSave,
  onClose,
}: OfficeFormModalProps) {
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [geocodeNotice, setGeocodeNotice] = useState<string | null>(null)

  const handleGeocode = async () => {
    setGeocoding(true)
    setGeocodeError(null)
    setGeocodeNotice(null)
    try {
      const res = await fetch('/api/network/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address_line1: form.address_line1,
          address_line2: form.address_line2,
          city: form.city,
          state: form.state,
          postal_code: form.postal_code,
          country: form.country,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const queryNote = data.query ? ` [tried: "${data.query}"]` : ''
        setGeocodeError(`${data.error || 'Geocoding failed'}${queryNote}`)
        return
      }
      setForm({
        ...form,
        latitude: data.lat.toFixed(7),
        longitude: data.lon.toFixed(7),
      })
      if (data.precision === 'city') {
        setGeocodeNotice(
          `Approximate (city-level) — OpenStreetMap couldn't find the exact street. Adjust lat/lng manually if you need a more precise marker.`
        )
      }
    } catch (err) {
      setGeocodeError(err instanceof Error ? err.message : 'Geocoding failed')
    } finally {
      setGeocoding(false)
    }
  }

  const update = (field: keyof OfficeFormState, value: string) =>
    setForm({ ...form, [field]: value })

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'create' ? 'Add Office' : 'Edit Office'}
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
              Office Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Atlanta"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
            <input
              type="text"
              value={form.address_line1}
              onChange={(e) => update('address_line1', e.target.value)}
              placeholder="Street address"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
            <input
              type="text"
              value={form.address_line2}
              onChange={(e) => update('address_line2', e.target.value)}
              placeholder="Suite, floor, etc. (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              aria-label="City"
              placeholder="City"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
            <input
              type="text"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
              aria-label="State or region"
              placeholder="State / Region"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <input
              type="text"
              value={form.postal_code}
              onChange={(e) => update('postal_code', e.target.value)}
              aria-label="Postal code"
              placeholder="Postal Code"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              aria-label="Country"
              placeholder="Country"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.latitude}
                onChange={(e) => update('latitude', e.target.value)}
                placeholder="e.g. 33.7490"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.longitude}
                onChange={(e) => update('longitude', e.target.value)}
                placeholder="e.g. -84.3880"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="button"
              onClick={handleGeocode}
              disabled={geocoding || saving}
              className="h-10 px-3 inline-flex items-center gap-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="Look up lat/lng from the address using OpenStreetMap"
            >
              {geocoding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              Geocode
            </button>
          </div>

          {geocodeError && (
            <p className="md:col-span-2 -mt-2 text-xs text-red-600">{geocodeError}</p>
          )}
          {geocodeNotice && !geocodeError && (
            <p className="md:col-span-2 -mt-2 text-xs text-amber-600">{geocodeNotice}</p>
          )}

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Auvik Network ID</label>
            <input
              type="text"
              value={form.auvik_network_id}
              onChange={(e) => update('auvik_network_id', e.target.value)}
              placeholder="Optional — for Auvik sync mapping"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              aria-label="Notes"
              placeholder="Optional notes about this office"
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
            disabled={saving || !form.name.trim()}
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
                {mode === 'create' ? 'Create Office' : 'Save Changes'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

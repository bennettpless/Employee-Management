'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { officeNameToLocation } from '@/lib/devices'
import type { EmployeeEditValues } from './EmployeeFormModal'

interface FormState {
  email: string
  first_name: string
  last_name: string
  display_name: string
  job_title: string
  department: string
  office_location: string
  phone_number: string
  extension: string
  username: string
}

const EMPTY_FORM: FormState = {
  email: '',
  first_name: '',
  last_name: '',
  display_name: '',
  job_title: '',
  department: '',
  office_location: '',
  phone_number: '',
  extension: '',
  username: '',
}

interface EmployeeCreateModalProps {
  onCreated: (employee: EmployeeEditValues) => void
  onClose: () => void
}

export default function EmployeeCreateModal({
  onCreated,
  onClose,
}: EmployeeCreateModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [displayNameTouched, setDisplayNameTouched] = useState(false)
  const [locations, setLocations] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/network/offices', { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        const names: string[] = Array.from(
          new Set((data.offices || []).map((o: any) => officeNameToLocation(o.name)))
        )
        if (!names.includes('Remote')) names.push('Remote')
        names.sort()
        setLocations(names)
      } catch (e) {
        console.error('Error loading office locations:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setField = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = e.target.value
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (
        !displayNameTouched &&
        (field === 'first_name' || field === 'last_name')
      ) {
        next.display_name = `${next.first_name} ${next.last_name}`.trim()
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (saving) return
    if (!form.email.trim()) {
      setError('Email is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          display_name: form.display_name.trim() || null,
          job_title: form.job_title.trim() || null,
          department: form.department.trim() || null,
          office_location: form.office_location.trim() || null,
          phone_number: form.phone_number.trim() || null,
          extension: form.extension.trim() || null,
          username: form.username.trim() || null,
        }),
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add employee')
      }
      onCreated(data.employee)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Add Employee</h2>
            <p className="text-sm text-gray-500 mt-1">
              For exceptions that bypass onboarding sync, such as employees
              joining through a merger
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={saving}
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>First Name</label>
            <input
              type="text"
              value={form.first_name}
              onChange={setField('first_name')}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input
              type="text"
              value={form.last_name}
              onChange={setField('last_name')}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => {
                setDisplayNameTouched(true)
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={setField('email')}
              className={inputClass}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">
              Also used as the Entra ID link, so future onboarding syncs match
              this person instead of creating a duplicate
            </p>
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              value={form.username}
              onChange={setField('username')}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>Job Title</label>
            <input
              type="text"
              value={form.job_title}
              onChange={setField('job_title')}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>Department</label>
            <input
              type="text"
              value={form.department}
              onChange={setField('department')}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>Office / Location</label>
            <select
              value={form.office_location}
              onChange={setField('office_location')}
              className={inputClass}
              disabled={saving}
            >
              <option value="">— None —</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="text"
              value={form.phone_number}
              onChange={setField('phone_number')}
              className={inputClass}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelClass}>Extension</label>
            <input
              type="text"
              value={form.extension}
              onChange={setField('extension')}
              className={inputClass}
              disabled={saving}
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !form.email.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding…
              </>
            ) : (
              'Add Employee'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

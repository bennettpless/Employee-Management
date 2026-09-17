'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { AppRole } from '@/lib/roles'

interface RoleRow {
  email: string
  role: AppRole
}

export default function AccessRoleLists() {
  const [admins, setAdmins] = useState<RoleRow[]>([])
  const [accounting, setAccounting] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/roles')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load roles')
      setAdmins(data.admins || [])
      setAccounting(data.accounting || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const addAdmin = async (email: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'admin' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add')
      setAdminEmail('')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (email: string) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/roles?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Access</h2>
      <p className="text-sm text-gray-600 mb-4">
        Only emails on the Admin list can sign in. Accounting receives the month-end stock-history
        email and does not log in to EMS.
      </p>
      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading role lists…
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">Admin</h3>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              IT — full access, including this Settings page.
            </p>
            <ul className="divide-y divide-gray-100 mb-4">
              {admins.length === 0 && <li className="py-2 text-sm text-gray-400">None yet</li>}
              {admins.map((row) => (
                <li key={row.email} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-800 truncate">{row.email}</span>
                  <button
                    type="button"
                    onClick={() => remove(row.email)}
                    disabled={saving}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (adminEmail.trim()) addAdmin(adminEmail)
              }}
            >
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="name@bennett-pless.com"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={saving}
              />
              <button
                type="submit"
                disabled={saving || !adminEmail.trim()}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </form>
          </div>
          {accounting.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900">Legacy accounting logins</h3>
              <p className="text-sm text-gray-600 mt-1 mb-4">
                These emails can no longer sign in. Remove them from this leftover list.
              </p>
              <ul className="divide-y divide-gray-100">
                {accounting.map((row) => (
                  <li key={row.email} className="py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 truncate">{row.email}</span>
                    <button
                      type="button"
                      onClick={() => remove(row.email)}
                      disabled={saving}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

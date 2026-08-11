'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Pencil, Search, UserPlus, Users } from 'lucide-react'
import EmployeeFormModal, {
  type EmployeeEditValues,
} from '@/components/employees/EmployeeFormModal'
import EmployeeCreateModal from '@/components/employees/EmployeeCreateModal'

interface EmployeeRow extends EmployeeEditValues {
  devices?: Array<{ count: number }>
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [editing, setEditing] = useState<EmployeeRow | null>(null)
  const [adding, setAdding] = useState(false)

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('status', 'active')
      if (searchTerm.trim()) params.set('search', searchTerm.trim())
      const res = await fetch(`/api/employees?${params}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load employees')
      setEmployees(data.employees || [])
    } catch (err) {
      console.error(err)
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchEmployees()
    }, searchTerm ? 250 : 0)
    return () => clearTimeout(t)
  }, [fetchEmployees, searchTerm])

  const rows = useMemo(() => {
    return [...employees].sort((a, b) =>
      (a.display_name || a.email || '').localeCompare(
        b.display_name || b.email || '',
        undefined,
        { sensitivity: 'base' }
      )
    )
  }, [employees])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Employees
                {!loading && (
                  <span className="ml-3 text-2xl font-normal text-gray-500">
                    ({rows.length})
                  </span>
                )}
              </h1>
              <p className="text-gray-600 max-w-2xl">
                Active employees from onboarding sync. New hires are added here
                automatically; use Edit to fix name or email typos. Offboarding
                sync removes departed employees from this list. Use Add
                Employee for exceptions the sync missed, such as merger
                additions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name or email..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No employees found
            </h3>
            <p className="text-gray-600">
              Try a different search, or run onboarding sync for new hires
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Devices
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((emp) => (
                  <tr key={emp.id} className="hover:bg-blue-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {emp.display_name ||
                        [emp.first_name, emp.last_name].filter(Boolean).join(' ') ||
                        '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">
                      {emp.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {emp.username || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {emp.job_title || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {emp.office_location || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {emp.devices?.[0]?.count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(emp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <EmployeeCreateModal
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setAdding(false)
            // Open the edit modal right away so devices can be assigned
            setEditing(created)
            void fetchEmployees()
          }}
        />
      )}

      {editing && (
        <EmployeeFormModal
          employee={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void fetchEmployees()
          }}
          onDeleted={() => {
            setEditing(null)
            void fetchEmployees()
          }}
          onDevicesChanged={() => {
            void fetchEmployees()
          }}
        />
      )}
    </div>
  )
}

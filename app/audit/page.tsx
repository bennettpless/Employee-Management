'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Monitor,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

interface AuditLog {
  id: string
  occurred_at: string
  actor: string
  action: string
  entity_type: string | null
  entity_id: string | null
  entity_label: string | null
  details: Record<string, unknown> | null
}

const ACTION_LABELS: Record<string, string> = {
  'device.create': 'Device created',
  'device.update': 'Device updated',
  'device.delete': 'Device deleted',
  'device.assign': 'Device assigned',
  'device.return': 'Device returned',
  'device_history.add': 'Repair/upgrade logged',
  'device_history.delete': 'Repair/upgrade entry removed',
  'employee.onboard': 'Employee onboarded',
  'employee.offboard': 'Employee offboarded',
  'sync.onboarding': 'Onboarding sync run',
  'sync.inventory_import': 'Inventory import run',
}

const actionBadgeClass = (action: string): string => {
  if (action.includes('delete') || action === 'employee.offboard' || action === 'device.return')
    return 'bg-red-100 text-red-800'
  if (action.includes('create') || action === 'employee.onboard') return 'bg-green-100 text-green-800'
  if (action.startsWith('sync.')) return 'bg-purple-100 text-purple-800'
  return 'bg-blue-100 text-blue-800'
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function DetailsBlock({ details }: { details: Record<string, unknown> }) {
  return (
    <pre className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(details, null, 2)}
    </pre>
  )
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [actionFilter, setActionFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [actionOptions, setActionOptions] = useState<string[]>([])
  const [actorOptions, setActorOptions] = useState<string[]>([])

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (actionFilter) params.set('action', actionFilter)
      if (actorFilter) params.set('actor', actorFilter)
      if (search.trim()) params.set('search', search.trim())
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const response = await fetch(`/api/audit?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load audit log')

      setLogs(data.logs)
      setTotal(data.total)
      setPageSize(data.pageSize)
      setActionOptions(data.filters?.actions || [])
      setActorOptions(data.filters?.actors || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, actorFilter, search, fromDate, toDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const resetPageAnd = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(1)
    setter(v)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-1 flex items-center gap-3">
                <ScrollText className="w-9 h-9 text-blue-600" />
                Audit Log
                {total > 0 && <span className="text-2xl font-normal text-gray-500">({total})</span>}
              </h1>
              <p className="text-gray-600">
                Every activity performed in the program — device changes, assignments,
                onboarding/offboarding, and sync runs
              </p>
            </div>
            <button
              onClick={fetchLogs}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value) }}
                placeholder="Search device or employee name..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => { setPage(1); setActionFilter(e.target.value) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">All Actions</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
              ))}
            </select>
            <select
              value={actorFilter}
              onChange={(e) => { setPage(1); setActorFilter(e.target.value) }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">All Users</option>
              {actorOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 min-w-0 sm:col-span-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setPage(1); setFromDate(e.target.value) }}
                className="w-full min-w-0 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                title="From date"
              />
              <span className="text-gray-400 text-sm flex-shrink-0">–</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setPage(1); setToDate(e.target.value) }}
                className="w-full min-w-0 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                title="To date"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
            {error}
            {error.includes('audit_logs') && (
              <p className="mt-1">
                Run <code className="bg-red-100 px-1 rounded">supabase/migrations/07_audit_logs.sql</code> in
                the Supabase SQL Editor to create the audit table.
              </p>
            )}
          </div>
        )}

        {/* Log table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading audit log...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <ScrollText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              No audit entries{actionFilter || actorFilter || search || fromDate || toDate ? ' match the filters' : ' yet'}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">When</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">By</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatTimestamp(log.occurred_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${actionBadgeClass(log.action)}`}>
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-800">
                          <span className="inline-flex items-center gap-1.5">
                            {log.entity_type === 'device' && <Monitor className="w-3.5 h-3.5 text-gray-400" />}
                            {log.entity_type === 'employee' && <User className="w-3.5 h-3.5 text-gray-400" />}
                            {log.entity_type === 'device' && log.entity_id ? (
                              <Link href={`/devices/${log.entity_id}`} className="text-blue-600 hover:underline">
                                {log.entity_label || log.entity_id}
                              </Link>
                            ) : (
                              log.entity_label || '—'
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{log.actor}</td>
                        <td className="px-4 py-3 text-right">
                          {log.details && Object.keys(log.details).length > 0 && (
                            <button
                              onClick={() => toggleExpanded(log.id)}
                              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                            >
                              {expanded.has(log.id) ? (
                                <>Hide <ChevronUp className="w-3.5 h-3.5" /></>
                              ) : (
                                <>View <ChevronDown className="w-3.5 h-3.5" /></>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded.has(log.id) && log.details && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={5} className="px-4 pb-3">
                            <DetailsBlock details={log.details} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && total > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
              <span>
                Page {page} of {totalPages} ({total} entries)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

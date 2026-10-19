'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Loader2, Mail } from 'lucide-react'
import {
  assertReportRange,
  formatMakeModel,
  formatUsd,
  monthKeyFromYmd,
  monthKeysFromThrough,
  monthLabel,
  periodBounds,
  periodLabel,
  reportTotals,
  trailingMonthKeys,
  ymdInTimeZone,
  type MonthEndGroup,
  type ReportPeriodMode,
} from '@/lib/stock-tracker'

const PERIOD_MODES: { id: ReportPeriodMode; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'month_to_month', label: 'Month to month' },
  { id: 'yearly', label: 'Yearly' },
]

function currentMonthKey(asOf: Date = new Date()): string {
  return monthKeyFromYmd(ymdInTimeZone(asOf))
}

function MonthSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label htmlFor={id} className="text-sm font-medium text-gray-700">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm bg-white min-w-[10rem]"
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {monthLabel(key)}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function StockReportsPage() {
  const [mode, setMode] = useState<ReportPeriodMode>('month')
  const [month, setMonth] = useState(() => currentMonthKey())
  const [startMonth, setStartMonth] = useState(() => {
    const now = currentMonthKey()
    const jan = `${now.slice(0, 4)}-01`
    return jan <= now ? jan : now
  })
  const [endMonth, setEndMonth] = useState(() => currentMonthKey())
  const [years, setYears] = useState(() => [Number(currentMonthKey().slice(0, 4))])
  const [year, setYear] = useState(() => Number(currentMonthKey().slice(0, 4)))
  const [groups, setGroups] = useState<MonthEndGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [range, setRange] = useState<{ start: string; end: string } | null>(null)
  const [emailing, setEmailing] = useState(false)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)

  const monthOptions = useMemo(() => {
    const now = currentMonthKey()
    const fallback = trailingMonthKeys(new Date(), 24)
    if (years.length === 0) return fallback
    const from = `${Math.min(...years)}-01`
    const keys = monthKeysFromThrough(from, now)
    return keys.length > 0 ? keys : fallback
  }, [years])

  const periodOpts = useMemo(
    () => ({ month, startMonth, endMonth, year }),
    [month, startMonth, endMonth, year]
  )
  const title = periodLabel(mode, periodOpts)

  const totals = useMemo(() => reportTotals(groups), [groups])

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/stock/reports')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load years')
      const list: number[] = data.years || []
      setYears(list)
      setYear((prev) => (list.includes(prev) ? prev : list[0] ?? prev))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load years')
    }
  }, [])

  const loadRange = useCallback(async (start: string, end: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start, end })
      const res = await fetch(`/api/stock/reports?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load report')
      setGroups(data.groups || [])
      setRange({ start, end })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
      setGroups([])
      setRange(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    let bounds: { start: string; end: string }
    try {
      bounds = periodBounds(mode, { month, startMonth, endMonth, year }, new Date())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid period')
      setGroups([])
      setLoading(false)
      return
    }
    const check = assertReportRange(bounds.start, bounds.end)
    if (!check.ok) {
      setError(check.error)
      setGroups([])
      setRange(null)
      setLoading(false)
      return
    }
    loadRange(bounds.start, bounds.end)
  }, [mode, month, startMonth, endMonth, year, loadRange])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const downloadCsv = () => {
    if (!range) return
    const params = new URLSearchParams({ start: range.start, end: range.end, format: 'csv' })
    window.location.href = `/api/stock/reports?${params.toString()}`
  }

  const emailPeriod = async () => {
    if (!range || emailing) return
    setEmailing(true)
    setEmailNotice(null)
    setError(null)
    try {
      const res = await fetch('/api/stock/reports/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: range.start, end: range.end }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send email')
      const to = Array.isArray(data.to) ? data.to.join(', ') : 'the report inbox'
      setEmailNotice(`Sent ${data.label || title} to ${to}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send email')
    } finally {
      setEmailing(false)
    }
  }

  const onStartMonth = (value: string) => {
    setStartMonth(value)
    if (value > endMonth) setEndMonth(value)
  }

  const onEndMonth = (value: string) => {
    setEndMonth(value)
    if (value < startMonth) setStartMonth(value)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
          <FileSpreadsheet className="w-4 h-4" />
          Accounting
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-600 mt-1 mb-6">
          Office allocations for stock items that left Admin inventory. Download CSV for the period
          on screen.
        </p>

        <div className="flex flex-wrap items-end gap-4 mb-6">
          <label htmlFor="period-type" className="text-sm font-medium text-gray-700">
            Period
            <select
              id="period-type"
              value={mode}
              onChange={(e) => setMode(e.target.value as ReportPeriodMode)}
              className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm bg-white min-w-[10rem]"
            >
              {PERIOD_MODES.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {mode === 'month' && (
            <MonthSelect
              id="report-month"
              label="Month"
              value={month}
              options={monthOptions}
              onChange={setMonth}
            />
          )}
          {mode === 'month_to_month' && (
            <>
              <MonthSelect
                id="report-start-month"
                label="From"
                value={startMonth}
                options={monthOptions}
                onChange={onStartMonth}
              />
              <MonthSelect
                id="report-end-month"
                label="Through"
                value={endMonth}
                options={monthOptions}
                onChange={onEndMonth}
              />
            </>
          )}
          {mode === 'yearly' && (
            <label htmlFor="report-year" className="text-sm font-medium text-gray-700">
              Year
              <select
                id="report-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm bg-white min-w-[8rem]"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!range || loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-md disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
          <button
            type="button"
            onClick={emailPeriod}
            disabled={!range || loading || emailing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-md disabled:opacity-50"
          >
            {emailing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Email this period
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        {emailNotice && (
          <p className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            {emailNotice}
          </p>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : groups.length === 0 ? (
            <p className="text-center text-gray-500 py-16">
              No stock-to-assigned PCs in {title}.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3">CPA #</th>
                  <th className="px-4 py-3">Date assigned</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Make / Model</th>
                  <th className="px-4 py-3">Lot purchased</th>
                  <th className="px-4 py-3">Office</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-right">Unit cost</th>
                  <th className="px-4 py-3 text-right">Allocated cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g) => {
                  const open = expanded.has(g.key)
                  return (
                    <Fragment key={g.key}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {g.rows.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggle(g.key)}
                              className="text-gray-400 hover:text-gray-700"
                            >
                              {open ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{g.cpa_number || '—'}</td>
                        <td className="px-4 py-3 text-gray-800">
                          {g.assigned_date}
                          {g.recorded_late && (
                            <span
                              className="block text-xs text-amber-700"
                              title="Assigned in an earlier month but entered in the stock tracker later, so it is on this report"
                            >
                              Recorded late
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-900">
                          {g.item_id}
                          {g.unmatched && (
                            <span className="ml-2 text-xs font-normal text-amber-700">Unmatched</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatMakeModel(g.manufacturer, g.model) || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{g.purchase_date || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{g.office}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{g.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {g.unit_cost == null ? '—' : formatUsd(g.unit_cost)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {formatUsd(g.allocated_cost)}
                        </td>
                      </tr>
                      {open &&
                        g.rows.map((row) => (
                          <tr key={row.id} className="bg-gray-50 text-gray-600">
                            <td />
                            <td className="px-4 py-2" colSpan={9}>
                              Serial {row.serial_number || '—'}
                              {row.user_name ? ` · ${row.user_name}` : ''}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-900 border-t border-gray-200">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" colSpan={6}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{totals.quantity}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsd(totals.allocated_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

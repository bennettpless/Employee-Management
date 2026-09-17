import { NextRequest, NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import {
  assertReportRange,
  monthEndCsv,
  parseReportYmd,
  rangeSpansMultipleMonths,
  reportCsvFilename,
  reportTotals,
  reportYearOptions,
} from '@/lib/stock-tracker'
import { fetchAllocationYears, fetchAllocationsInRange, reportGroupsFor } from '@/lib/stock-reports'

export async function GET(request: NextRequest) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const startParam = parseReportYmd(request.nextUrl.searchParams.get('start'))
    const endParam = parseReportYmd(request.nextUrl.searchParams.get('end'))
    const format = request.nextUrl.searchParams.get('format')

    if (startParam || endParam) {
      if (!startParam || !endParam) {
        return NextResponse.json({ error: 'Start and end dates are required' }, { status: 400 })
      }
      const range = assertReportRange(startParam, endParam)
      if (!range.ok) {
        return NextResponse.json({ error: range.error }, { status: 400 })
      }
      const rows = await fetchAllocationsInRange(startParam, endParam)
      const groups = reportGroupsFor(rows)
      const totals = reportTotals(groups)
      if (format === 'csv') {
        const csv = monthEndCsv(groups, {
          includeMonthColumn: rangeSpansMultipleMonths(startParam, endParam),
        })
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${reportCsvFilename(startParam, endParam)}"`,
          },
        })
      }
      return NextResponse.json({
        start: startParam,
        end: endParam,
        groups,
        totals,
      })
    }

    const years = await fetchAllocationYears()
    return NextResponse.json({
      years: reportYearOptions(years),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load report'
    console.error('Error loading stock report:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

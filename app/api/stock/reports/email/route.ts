import { NextRequest, NextResponse } from 'next/server'
import { isStockAccessRequest } from '@/lib/admin'
import { assertReportRange, parseReportYmd } from '@/lib/stock-tracker'
import { sendStockReportEmail } from '@/lib/stock-report-email'

export async function POST(request: NextRequest) {
  try {
    if (!(await isStockAccessRequest())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = (await request.json().catch(() => ({}))) as {
      month?: string
      start?: string
      end?: string
    }
    if (body.start || body.end) {
      const start = parseReportYmd(body.start || null)
      const end = parseReportYmd(body.end || null)
      if (!start || !end) {
        return NextResponse.json({ error: 'Start and end dates are required' }, { status: 400 })
      }
      const range = assertReportRange(start, end)
      if (!range.ok) {
        return NextResponse.json({ error: range.error }, { status: 400 })
      }
    }
    const result = await sendStockReportEmail(body)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send stock report email'
    console.error('Stock report email failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

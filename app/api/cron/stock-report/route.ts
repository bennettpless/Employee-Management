import { NextRequest, NextResponse } from 'next/server'
import { isCronBearerAuthorized } from '@/lib/cron-auth'
import { sendStockReportEmail } from '@/lib/stock-report-email'

export async function POST(request: NextRequest) {
  try {
    if (!isCronBearerAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const result = await sendStockReportEmail()
    return NextResponse.json({ ok: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send stock report email'
    console.error('Cron stock report email failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

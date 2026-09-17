import { sendGraphMail } from '@/lib/azure-graph'
import { fetchAllocationsInRange, reportGroupsFor } from '@/lib/stock-reports'
import {
  completedMonthKey,
  formatUsd,
  monthBounds,
  monthEndCsv,
  monthLabel,
  officeReportTotals,
  parseReportYmd,
  reportCsvFilename,
  reportTotals,
} from '@/lib/stock-tracker'

export const DEFAULT_STOCK_REPORT_EMAIL_TO = 'dsimmons@bennett-pless.com'

export function stockReportEmailRecipients(): string[] {
  const raw = process.env.STOCK_REPORT_EMAIL_TO || DEFAULT_STOCK_REPORT_EMAIL_TO
  return raw
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

export function stockReportEmailFrom(): string {
  const from = String(process.env.STOCK_REPORT_EMAIL_FROM || '').trim()
  if (from) return from
  return stockReportEmailRecipients()[0] || DEFAULT_STOCK_REPORT_EMAIL_TO
}

export function resolveReportEmailRange(
  body: { month?: string; start?: string; end?: string } | null | undefined,
  asOf: Date = new Date()
): { start: string; end: string; label: string } {
  const month = String(body?.month || '').trim()
  if (month) {
    const bounds = monthBounds(month)
    return { ...bounds, label: monthLabel(month) }
  }
  const start = parseReportYmd(body?.start || null)
  const end = parseReportYmd(body?.end || null)
  if (start && end) {
    if (start > end) throw new Error('Start date must be on or before end date')
    const startMonth = start.slice(0, 7)
    const bounds = monthBounds(startMonth)
    if (start === bounds.start && end === bounds.end) {
      return { start, end, label: monthLabel(startMonth) }
    }
    return { start, end, label: `${start} to ${end}` }
  }
  const key = completedMonthKey(asOf)
  const bounds = monthBounds(key)
  return { ...bounds, label: monthLabel(key) }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function stockReportEmailHtml(opts: {
  label: string
  groups: ReturnType<typeof reportGroupsFor>
  appUrl?: string
}): string {
  const totals = reportTotals(opts.groups)
  const offices = officeReportTotals(opts.groups)
  const appUrl = String(opts.appUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const reportHref = appUrl ? `${appUrl}/stock/reports` : '/stock/reports'
  const officeRows =
    offices.length === 0
      ? `<tr><td colspan="3" style="padding:8px;color:#6b7280">No stock assignments in ${escapeHtml(opts.label)}.</td></tr>`
      : offices
          .map(
            (row) =>
              `<tr>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(row.office)}</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${row.quantity}</td>
                <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(formatUsd(row.allocated_cost))}</td>
              </tr>`
          )
          .join('')
  return `<!DOCTYPE html>
<html>
  <body style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.45">
    <p>Stock assignments that left Admin inventory in <strong>${escapeHtml(opts.label)}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:320px">
      <thead>
        <tr>
          <th align="left" style="padding:8px;border-bottom:2px solid #d1d5db">Office</th>
          <th align="right" style="padding:8px;border-bottom:2px solid #d1d5db">Qty</th>
          <th align="right" style="padding:8px;border-bottom:2px solid #d1d5db">Amount</th>
        </tr>
      </thead>
      <tbody>${officeRows}</tbody>
      <tfoot>
        <tr>
          <td style="padding:8px;font-weight:600">Total</td>
          <td style="padding:8px;font-weight:600;text-align:right">${totals.quantity}</td>
          <td style="padding:8px;font-weight:600;text-align:right">${escapeHtml(formatUsd(totals.allocated_cost))}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:16px">CSV for ${escapeHtml(opts.label)} is attached. Open the live report: <a href="${escapeHtml(reportHref)}">${escapeHtml(reportHref)}</a></p>
  </body>
</html>`
}

export async function sendStockReportEmail(opts?: {
  month?: string
  start?: string
  end?: string
  asOf?: Date
}): Promise<{
  start: string
  end: string
  label: string
  to: string[]
  from: string
  quantity: number
  allocated_cost: number
}> {
  const range = resolveReportEmailRange(opts, opts?.asOf)
  const rows = await fetchAllocationsInRange(range.start, range.end)
  const groups = reportGroupsFor(rows)
  const totals = reportTotals(groups)
  const csv = monthEndCsv(groups)
  const to = stockReportEmailRecipients()
  const from = stockReportEmailFrom()
  try {
    await sendGraphMail({
      from,
      to,
      subject: `Stock allocation report — ${range.label}`,
      html: stockReportEmailHtml({ label: range.label, groups }),
      attachments: [
        {
          name: reportCsvFilename(range.start, range.end),
          contentType: 'text/csv',
          contentBytes: Buffer.from(csv, 'utf8').toString('base64'),
        },
      ],
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/access is denied|authorization_requestdenied|erroraccessdenied|mailboxnotenabled/i.test(message)) {
      throw new Error(
        'Graph cannot send mail yet. Grant the EMS Azure AD app Mail.Send (application permission), admin-consent it, and set STOCK_REPORT_EMAIL_FROM to a mailbox it can send as (for testing, dsimmons@bennett-pless.com).'
      )
    }
    throw error
  }
  return { ...range, to, from, ...totals }
}

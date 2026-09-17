import { describe, it, expect, afterEach } from 'vitest'
import { isCronBearerAuthorized } from '@/lib/cron-auth'

describe('cron bearer auth', () => {
  const prevReport = process.env.STOCK_REPORT_CRON_SECRET
  const prevSync = process.env.SYNC_CRON_SECRET

  afterEach(() => {
    if (prevReport === undefined) delete process.env.STOCK_REPORT_CRON_SECRET
    else process.env.STOCK_REPORT_CRON_SECRET = prevReport
    if (prevSync === undefined) delete process.env.SYNC_CRON_SECRET
    else process.env.SYNC_CRON_SECRET = prevSync
  })

  it('accepts a matching Bearer token', () => {
    delete process.env.STOCK_REPORT_CRON_SECRET
    process.env.SYNC_CRON_SECRET = 'test-cron-secret'
    const req = new Request('http://localhost/api/cron/stock-report', {
      headers: { authorization: 'Bearer test-cron-secret' },
    })
    expect(isCronBearerAuthorized(req)).toBe(true)
  })

  it('rejects a missing or wrong token', () => {
    process.env.SYNC_CRON_SECRET = 'test-cron-secret'
    expect(isCronBearerAuthorized(new Request('http://localhost/api/cron/stock-report'))).toBe(false)
    const req = new Request('http://localhost/api/cron/stock-report', {
      headers: { authorization: 'Bearer other' },
    })
    expect(isCronBearerAuthorized(req)).toBe(false)
  })
})

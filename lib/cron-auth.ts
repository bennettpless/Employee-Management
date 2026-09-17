import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

export function cronSecretFromEnv(): string | null {
  const secret = process.env.STOCK_REPORT_CRON_SECRET || process.env.SYNC_CRON_SECRET
  const trimmed = String(secret || '').trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isCronBearerAuthorized(request: NextRequest | Request): boolean {
  const secret = cronSecretFromEnv()
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

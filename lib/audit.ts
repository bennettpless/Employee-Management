import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { DEV_AUTH_DISABLED, DEV_MOCK_SESSION } from '@/lib/dev-auth'
import { getServiceSupabase } from '@/lib/supabase'

export interface AuditEntry {
  actor: string
  action: string
  entity_type?: 'device' | 'employee' | 'device_history' | 'sync'
  entity_id?: string | null
  entity_label?: string | null
  details?: Record<string, unknown> | null
}

/** Email of the signed-in user making this request, for audit attribution. */
export async function currentActor(): Promise<string> {
  if (DEV_AUTH_DISABLED) return DEV_MOCK_SESSION.user?.email || 'dev-admin'
  const session = await getServerSession(authOptions)
  return session?.user?.email || 'unknown'
}

/**
 * Record an audit log entry. Fire-and-forget: an audit failure (e.g. the
 * audit_logs table missing) must never break the action being audited.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = getServiceSupabase()
    const { error } = await supabase.from('audit_logs').insert({
      actor: entry.actor,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      entity_label: entry.entity_label ?? null,
      details: entry.details ?? null,
    })
    if (error) console.error('Audit log insert failed:', error.message)
  } catch (e: any) {
    console.error('Audit log insert failed:', e?.message || e)
  }
}

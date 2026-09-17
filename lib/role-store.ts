import { getServiceSupabase } from '@/lib/supabase'
import {
  isSeedAdmin,
  normalizeEmail,
  SEED_ADMIN_EMAILS,
  type AppRole,
} from '@/lib/roles'

type RoleRow = { email: string; role: AppRole; created_at?: string; created_by?: string | null }

function isMissingTable(error: { message?: string; code?: string } | null): boolean {
  const msg = String(error?.message || '').toLowerCase()
  return error?.code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')
}

/**
 * Look up the caller's app role. Falls back to the seed admin list when the
 * table is missing so a deploy cannot lock IT out before the migration runs.
 */
export async function getRoleForEmail(email?: string | null): Promise<AppRole | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('app_user_roles')
      .select('email, role')
      .eq('email', normalized)
      .maybeSingle()

    if (error) {
      if (isMissingTable(error) && isSeedAdmin(normalized)) return 'admin'
      if (!isMissingTable(error)) {
        console.error('getRoleForEmail failed:', error.message)
      }
      return isSeedAdmin(normalized) ? 'admin' : null
    }

    if (data?.role === 'admin' || data?.role === 'accounting') return data.role

    const { count, error: countError } = await supabase
      .from('app_user_roles')
      .select('email', { count: 'exact', head: true })

    if (!countError && (count ?? 0) === 0 && isSeedAdmin(normalized)) return 'admin'
    return null
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('getRoleForEmail failed:', message)
    return isSeedAdmin(normalized) ? 'admin' : null
  }
}

export async function listRoles(): Promise<RoleRow[]> {
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('app_user_roles')
    .select('email, role, created_at, created_by')
    .order('role', { ascending: true })
    .order('email', { ascending: true })

  if (error) {
    if (isMissingTable(error)) {
      return SEED_ADMIN_EMAILS.map((email) => ({
        email,
        role: 'admin' as const,
        created_by: 'seed',
      }))
    }
    throw error
  }
  return (data || []) as RoleRow[]
}

export async function upsertRole(
  email: string,
  role: AppRole,
  createdBy: string
): Promise<RoleRow> {
  const normalized = normalizeEmail(email)
  if (!normalized || !normalized.includes('@')) {
    throw new Error('A valid email is required')
  }
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('app_user_roles')
    .upsert(
      { email: normalized, role, created_by: createdBy },
      { onConflict: 'email' }
    )
    .select('email, role, created_at, created_by')
    .single()
  if (error) throw error
  return data as RoleRow
}

export async function deleteRole(email: string): Promise<void> {
  const supabase = getServiceSupabase()
  const { error } = await supabase.from('app_user_roles').delete().eq('email', normalizeEmail(email))
  if (error) throw error
}

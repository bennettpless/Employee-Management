import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

const PAGE_SIZE = 50

// Entries older than this are purged automatically (override with AUDIT_RETENTION_DAYS)
const RETENTION_DAYS = Math.max(30, parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10) || 365)

// Purge at most once per hour per server instance
let lastPurgeAt = 0

async function purgeOldEntries(supabase: ReturnType<typeof getServiceSupabase>) {
  if (Date.now() - lastPurgeAt < 60 * 60 * 1000) return
  lastPurgeAt = Date.now()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('audit_logs').delete().lt('occurred_at', cutoff)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    await purgeOldEntries(supabase)
    const searchParams = new URL(request.url).searchParams
    const action = searchParams.get('action')
    const entityType = searchParams.get('entity_type')
    const actor = searchParams.get('actor')
    const search = searchParams.get('search')
    const from = searchParams.get('from') // ISO date
    const to = searchParams.get('to')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    if (action) query = query.eq('action', action)
    if (entityType) query = query.eq('entity_type', entityType)
    if (actor) query = query.eq('actor', actor)
    if (search) query = query.ilike('entity_label', `%${search}%`)
    if (from) query = query.gte('occurred_at', from)
    if (to) query = query.lte('occurred_at', `${to}T23:59:59.999Z`)

    const { data: logs, error, count } = await query
    if (error) throw error

    // Distinct filter options from the full table (cheap at this scale)
    const { data: allRows } = await supabase
      .from('audit_logs')
      .select('action, actor')
      .limit(10000)
    const actions = Array.from(new Set((allRows || []).map((r: any) => r.action))).sort()
    const actors = Array.from(new Set((allRows || []).map((r: any) => r.actor))).sort()

    return NextResponse.json({
      logs: logs || [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      filters: { actions, actors },
    })
  } catch (error: any) {
    console.error('Error fetching audit logs:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch audit logs' },
      { status: 500 }
    )
  }
}

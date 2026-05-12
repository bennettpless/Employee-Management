import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabase()
    
    const { data: allLogs, error: allError } = await supabase
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20)

    if (allError) {
      throw allError
    }

    const { data: latestNinjaLog } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('sync_type', 'ninjaone')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const logsMap = new Map()
    if (allLogs) {
      allLogs.forEach(log => logsMap.set(log.id, log))
    }
    if (latestNinjaLog) {
      logsMap.set(latestNinjaLog.id, latestNinjaLog)
    }
    
    const logs = Array.from(logsMap.values())
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 10)

    return NextResponse.json(
      { logs: logs || [] },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (error: any) {
    console.error('Error fetching sync logs:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sync logs' },
      { status: 500 }
    )
  }
}

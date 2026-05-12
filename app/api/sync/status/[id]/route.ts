import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getServiceSupabase()
    
    const { data: syncLog, error } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!syncLog) {
      return NextResponse.json(
        { error: 'Sync log not found' },
        { status: 404 }
      )
    }
    
    const isComplete = syncLog.completed_at !== null && 
                       syncLog.completed_at !== undefined && 
                       String(syncLog.completed_at).toLowerCase() !== 'null'

    return NextResponse.json({
      id: syncLog.id,
      status: syncLog.status,
      isComplete,
      recordsSynced: syncLog.records_synced || 0,
      recordsFailed: syncLog.records_failed || 0,
      duration: syncLog.duration_seconds,
      completedAt: syncLog.completed_at,
      errorMessage: syncLog.error_message,
      startedAt: syncLog.started_at
    })
  } catch (error: any) {
    console.error('Error fetching sync status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sync status' },
      { status: 500 }
    )
  }
}

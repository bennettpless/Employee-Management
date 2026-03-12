import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Use the exact same query as /api/sync/logs since that endpoint returns correct data
    // Query directly from database using same pattern
    const supabase = getServiceSupabase()
    
    // Query sync logs exactly like /api/sync/logs does
    const { data: allLogs, error } = await supabase
      .from('sync_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100)
    
    if (error) {
      console.error(`[Status Check] Error fetching sync logs:`, error)
      throw error
    }
    
    // Find the sync log with matching ID from the list
    const syncLog = allLogs?.find((log: any) => log.id === params.id)
    
    if (!syncLog) {
      // If not found in recent logs, the sync might be older - try direct query
      console.log(`[Status Check] Sync ${params.id} not found in recent 100 logs, trying direct query...`)
      const { data: directSyncLog, error: directError } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('id', params.id)
        .maybeSingle()
      
      if (directError || !directSyncLog) {
        console.error(`[Status Check] Sync log not found for ID: ${params.id}`)
        return NextResponse.json(
          { error: 'Sync log not found' },
          { status: 404 }
        )
      }
      
      return await processSyncLog(directSyncLog, params.id)
    }
    
    return await processSyncLog(syncLog, params.id)
  } catch (error: any) {
    console.error(`[Status Check] Error fetching sync status for ID ${params.id}:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sync status' },
      { status: 500 }
    )
  }
}

async function processSyncLog(syncLog: any, id: string) {
  // Check completed_at more carefully - it might be a string "null" or actual null
  const isComplete = syncLog.completed_at !== null && 
                     syncLog.completed_at !== undefined && 
                     String(syncLog.completed_at).toLowerCase() !== 'null'
  const status = syncLog.status
  
  // Log ALL details to help debug - log RAW values first
  console.log(`[Status Check ${id}] RAW sync log data:`, JSON.stringify(syncLog, null, 2))
  console.log(`[Status Check ${id}] Full sync log data:`, {
    id: syncLog.id,
    sync_type: syncLog.sync_type,
    status: status,
    isComplete: isComplete,
    completed_at: syncLog.completed_at,
    completed_at_type: typeof syncLog.completed_at,
    completed_at_raw: syncLog.completed_at === null ? 'NULL' : syncLog.completed_at === undefined ? 'UNDEFINED' : String(syncLog.completed_at),
    records_synced: syncLog.records_synced,
    records_synced_type: typeof syncLog.records_synced,
    records_failed: syncLog.records_failed,
    duration_seconds: syncLog.duration_seconds,
    started_at: syncLog.started_at,
    error_message: syncLog.error_message
  })
  
  if (isComplete) {
    console.log(`[Status Check] ✅ Sync ${id} is COMPLETE - status: ${status}, synced: ${syncLog.records_synced || 0}, failed: ${syncLog.records_failed || 0}`)
  } else {
    console.log(`[Status Check] ⏳ Sync ${id} is IN PROGRESS - status: ${status}, completed_at is ${syncLog.completed_at === null ? 'null' : syncLog.completed_at}`)
  }
  
  return NextResponse.json({
    id: syncLog.id,
    status,
    isComplete,
    recordsSynced: syncLog.records_synced || 0,
    recordsFailed: syncLog.records_failed || 0,
    duration: syncLog.duration_seconds,
    completedAt: syncLog.completed_at,
    errorMessage: syncLog.error_message,
    startedAt: syncLog.started_at
  })
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { SyncLog } from '@/lib/types'
import { format } from 'date-fns'

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<{ [key: string]: boolean }>({})

  useEffect(() => {
    fetchSyncLogs()
    // Refresh sync logs every 3 seconds to show latest data
    const interval = setInterval(() => {
      fetchSyncLogs()
    }, 3000)
    
    return () => clearInterval(interval)
  }, [])

  const fetchSyncLogs = async () => {
    try {
      // Add cache-busting parameter
      const response = await fetch(`/api/sync/logs?t=${Date.now()}`, {
        cache: 'no-store'
      })
      const data = await response.json()
      console.log('Fetched sync logs:', data)
      const logs = data.logs || []
      setSyncLogs(logs)
      return logs
    } catch (error) {
      console.error('Error fetching sync logs:', error)
      return []
    } finally {
      setLoading(false)
    }
  }


  const getSyncIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'partial':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />
      default:
        return <RefreshCw className="w-5 h-5 text-gray-600" />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Data Synchronization</h1>
          <p className="text-gray-600">Monitor and trigger data syncs from external systems</p>
        </div>

        {/* Excel Sync Button */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Sync from SharePoint Excel</h3>
              <p className="text-sm text-gray-600">Sync employee and device data from the SharePoint Excel file "BP Employee list and inventory.xlsx"</p>
            </div>
          </div>
          <button
            onClick={async () => {
              if (syncing['excel'] || syncing['ninjaone']) return
              
              setSyncing(prev => ({ ...prev, excel: true, ninjaone: true }))
              
              try {
                // Start Excel sync
                const response = await fetch('/api/sync/excel', { method: 'POST' })
                const result = await response.json()
                
                if (!response.ok) {
                  throw new Error(result.error || 'Failed to sync Excel data')
                }
                
                // Excel sync completed, now wait for Ninja sync
                console.log('Excel sync completed, waiting for Ninja sync...')
                
                // Show alert first (non-blocking by using setTimeout)
                const message = `Excel sync completed!\n\n` +
                  `Synced: ${result.recordsSynced || 0} records\n` +
                  `Failed: ${result.recordsFailed || 0} records\n` +
                  (result.duration ? `Duration: ${result.duration}s\n` : '') +
                  (result.errors && result.errors.length > 0 ? `\nErrors:\n${result.errors.slice(0, 5).join('\n')}` : '') +
                  `\n\nNinja sync is running in the background to populate device details...`
                
                // Show alert asynchronously so it doesn't block polling
                setTimeout(() => alert(message), 100)
                
                // Poll for Ninja sync completion
                const pollInterval = 3000 // Poll every 3 seconds
                const maxAttempts = 200 // Maximum 10 minutes (200 * 3 seconds)
                let attempts = 0
                let pollingStopped = false
                const excelSyncStartTime = Date.now()
                
                const checkNinjaSync = async (): Promise<void> => {
                  // Stop if polling was already stopped
                  if (pollingStopped) {
                    console.log('Polling already stopped, exiting')
                    return
                  }
                  
                  attempts++
                  
                  if (attempts > maxAttempts) {
                    console.warn('Ninja sync is taking longer than expected - stopping polling')
                    pollingStopped = true
                    setSyncing(prev => ({ ...prev, ninjaone: false }))
                    return
                  }
                  
                  // Fetch latest logs
                  const logs = await fetchSyncLogs()
                  
                  // Find the most recent NinjaOne sync log
                  const allNinjaLogs = logs
                    .filter(log => log.sync_type === 'ninjaone')
                    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
                  
                  console.log(`[Poll ${attempts}] Found ${allNinjaLogs.length} NinjaOne logs. All sync types:`, logs.map(l => `${l.sync_type} (${l.started_at})`))
                  
                  if (allNinjaLogs.length > 0) {
                    const latestNinjaLog = allNinjaLogs[0] // Most recent
                    
                    // Check if this is a new sync (started after Excel sync or very recent)
                    const logStartedTime = new Date(latestNinjaLog.started_at).getTime()
                    const isRecentSync = logStartedTime >= excelSyncStartTime - 30000 || // 30 seconds before Excel sync
                                        logStartedTime >= Date.now() - (5 * 60 * 1000) // Or within last 5 minutes
                    
                    if (!isRecentSync && attempts < 10) {
                      // If it's not a recent sync and we haven't tried many times, wait for the new log to appear
                      console.log(`⏳ Most recent NinjaOne log is old (${latestNinjaLog.started_at}), waiting for new sync to appear... (attempt ${attempts})`)
                    } else {
                      // Check this log
                      const completedAt = latestNinjaLog.completed_at
                      const status = latestNinjaLog.status
                      
                      console.log(`[Poll ${attempts}] Checking Ninja sync log:`, {
                        id: latestNinjaLog.id,
                        started: latestNinjaLog.started_at,
                        completed: completedAt,
                        status: status,
                        isRecent: isRecentSync,
                        completedAtType: typeof completedAt,
                        completedAtValue: completedAt,
                        isNull: completedAt === null,
                        isEmpty: completedAt === '',
                        hasCompletedAt: !!completedAt && completedAt !== null && completedAt !== ''
                      })
                    
                      // If sync is completed, we're done
                      const isCompleted = completedAt && 
                                         completedAt !== null && 
                                         completedAt !== '' &&
                                         String(completedAt).trim() !== ''
                      
                      if (isCompleted) {
                        console.log('✅ Ninja sync completed - stopping polling')
                        pollingStopped = true
                        setSyncing(prev => {
                          console.log('Setting ninjaone to false, previous state:', prev)
                          const newState = { ...prev, ninjaone: false }
                          console.log('New state:', newState)
                          return newState
                        })
                        await fetchSyncLogs() // Final refresh
                        return
                    }
                    
                      // If sync is in progress, continue polling
                      console.log(`⏳ Ninja sync in progress (started at ${latestNinjaLog.started_at}, status: ${status}, completed_at: ${completedAt || 'not set'})`)
                    }
                  } else {
                    // No Ninja sync log found yet - it might not have started
                    console.log(`⏳ Waiting for Ninja sync to start... (attempt ${attempts}/${maxAttempts})`)
                    console.log(`Available logs: ${logs.map(l => `${l.sync_type} (${l.started_at})`).join(', ')}`)
                  }
                  
                  // Continue polling
                    await new Promise(resolve => setTimeout(resolve, pollInterval))
                  return checkNinjaSync()
                }
                
                // Start polling for Ninja sync immediately (don't await, let it run in background)
                checkNinjaSync().catch(err => {
                  console.error('Error polling Ninja sync:', err)
                  pollingStopped = true
                  setSyncing(prev => ({ ...prev, ninjaone: false }))
                })
                
              } catch (error: any) {
                console.error('Error syncing Excel:', error)
                alert(`Excel sync failed: ${error.message || error}\n\nPlease check the sync history below for details.`)
                setSyncing(prev => ({ ...prev, excel: false, ninjaone: false }))
              } finally {
                setSyncing(prev => ({ ...prev, excel: false }))
                // Refresh logs immediately and then again after a short delay
                await fetchSyncLogs()
                setTimeout(() => fetchSyncLogs(), 2000) // Refresh again after 2 seconds
              }
            }}
            disabled={syncing['excel'] || syncing['ninjaone']}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
          >
            {syncing['excel'] || syncing['ninjaone'] ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {syncing['excel'] ? 'Syncing from Excel...' : 'Syncing devices from NinjaOne...'}
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Sync from Excel
              </>
            )}
          </button>
        </div>

        {/* Sync History */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Sync History</h2>
          
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : syncLogs.length === 0 ? (
            <p className="text-center text-gray-600 py-12">No sync history available</p>
          ) : (
            <div className="space-y-3">
              {syncLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1">
                      <div className="mr-3 mt-0.5">
                        {getSyncIcon(log.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-semibold text-gray-900">
                            {log.sync_type.replace('-', ' ').toUpperCase()}
                          </h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            log.status === 'success' ? 'bg-green-100 text-green-800' :
                            log.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                          <span>Synced: {log.records_synced}</span>
                          {log.records_failed > 0 && (
                            <span className="text-red-600">Failed: {log.records_failed}</span>
                          )}
                          {log.duration_seconds && (
                            <span>Duration: {log.duration_seconds}s</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {format(new Date(log.started_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


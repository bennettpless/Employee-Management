'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { SyncLog } from '@/lib/types'
import { format } from 'date-fns'

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchSyncLogs()
    const interval = setInterval(fetchSyncLogs, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchSyncLogs = async () => {
    try {
      const response = await fetch(`/api/sync/logs?t=${Date.now()}`, { cache: 'no-store' })
      const data = await response.json()
      setSyncLogs(data.logs || [])
    } catch (error) {
      console.error('Error fetching sync logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleNinjaSync = async () => {
    if (syncing) return
    setSyncing(true)
    
    try {
      const response = await fetch('/api/sync/ninjaone', { method: 'POST' })
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync from NinjaOne')
      }
      
      await fetchSyncLogs()
      
      // Poll for completion
      const pollForCompletion = async () => {
        const maxAttempts = 200
        let attempts = 0
        
        while (attempts < maxAttempts) {
          attempts++
          await new Promise(resolve => setTimeout(resolve, 3000))
          
          const logs = await fetchSyncLogs().then(() => syncLogs)
          const latestNinja = syncLogs
            .filter(log => log.sync_type === 'ninjaone')
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
          
          if (latestNinja?.completed_at) {
            setSyncing(false)
            await fetchSyncLogs()
            return
          }
        }
        
        setSyncing(false)
      }
      
      pollForCompletion().catch(() => setSyncing(false))
    } catch (error: any) {
      console.error('Error syncing NinjaOne:', error)
      alert(`NinjaOne sync failed: ${error.message}`)
      setSyncing(false)
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
          <p className="text-gray-600">Sync device and software data from NinjaOne</p>
        </div>

        {/* NinjaOne Sync Button */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sync from NinjaOne</h3>
            <p className="text-sm text-gray-600">
              Pull latest device details, hardware specs, and installed software from NinjaOne. 
              This also runs automatically every day at 3:00 AM UTC.
            </p>
          </div>
          <button
            onClick={handleNinjaSync}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
          >
            {syncing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Syncing from NinjaOne...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Sync from NinjaOne
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
              {syncLogs.slice(0, 20).map((log) => (
                <div key={log.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1">
                      <div className="mr-3 mt-0.5">
                        {getSyncIcon(log.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-semibold text-gray-900">
                            {log.sync_type === 'ninjaone' ? 'NinjaOne' : log.sync_type.toUpperCase()}
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

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2, Network as NetworkIcon } from 'lucide-react'
import { SyncLog } from '@/lib/types'
import { format } from 'date-fns'

export default function SyncPage() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<any>(null)
  const [intuneSync, setIntuneSync] = useState(false)
  const [intuneResult, setIntuneResult] = useState<any>(null)
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState<any>(null)
  const [auvikConfigured, setAuvikConfigured] = useState<boolean | null>(null)
  const [auvikSyncing, setAuvikSyncing] = useState(false)
  const [auvikResult, setAuvikResult] = useState<any>(null)

  useEffect(() => {
    fetchSyncLogs()
    const interval = setInterval(fetchSyncLogs, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false
    const checkAuvik = async () => {
      try {
        const res = await fetch('/api/network/sync/auvik', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setAuvikConfigured(false)
          return
        }
        const data = await res.json()
        if (!cancelled) setAuvikConfigured(Boolean(data.configured))
      } catch {
        if (!cancelled) setAuvikConfigured(false)
      }
    }
    checkAuvik()
    return () => {
      cancelled = true
    }
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

  const handleIntuneSync = async () => {
    if (intuneSync) return
    setIntuneSync(true)
    setIntuneResult(null)

    try {
      const response = await fetch('/api/sync/intune', { method: 'POST' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync from Intune')
      }

      setIntuneResult(result)
      await fetchSyncLogs()
    } catch (error: any) {
      console.error('Error syncing Intune:', error)
      alert(`Intune sync failed: ${error.message}`)
    } finally {
      setIntuneSync(false)
    }
  }

  const handleSeedFromExcel = async () => {
    if (seeding) return
    if (!confirm('This will DELETE ALL DATA in the database and re-import from the Excel sheet. Are you sure?')) return

    setSeeding(true)
    setSeedResult(null)

    try {
      const response = await fetch('/api/seed/from-excel', { method: 'POST' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to seed from Excel')
      }

      setSeedResult(result)
      await fetchSyncLogs()
    } catch (error: any) {
      console.error('Error seeding from Excel:', error)
      alert(`Seed failed: ${error.message}`)
    } finally {
      setSeeding(false)
    }
  }

  const handleAuvikSync = async () => {
    if (auvikSyncing) return
    setAuvikSyncing(true)
    setAuvikResult(null)
    try {
      const response = await fetch('/api/network/sync/auvik', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync from Auvik')
      }
      setAuvikResult(result)
      await fetchSyncLogs()
    } catch (error: any) {
      console.error('Error syncing Auvik:', error)
      alert(`Auvik sync failed: ${error.message}`)
    } finally {
      setAuvikSyncing(false)
    }
  }

  const handleAssignDevices = async () => {
    if (assigning) return
    setAssigning(true)
    setAssignResult(null)

    try {
      const response = await fetch('/api/devices/assign-from-excel', { method: 'POST' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign devices')
      }

      setAssignResult(result)
    } catch (error: any) {
      console.error('Error assigning devices:', error)
      alert(`Assignment failed: ${error.message}`)
    } finally {
      setAssigning(false)
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
          <p className="text-gray-600">Sync device data from NinjaOne and Intune</p>
        </div>

        {/* Seed from Excel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-red-500">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Seed from Excel</h3>
            <p className="text-sm text-gray-600">
              Wipe the entire database and re-import all employees from the SharePoint Excel sheet 
              (&quot;Master Employee List&quot;). Run NinjaOne sync afterward to populate device details.
            </p>
          </div>
          <button
            onClick={handleSeedFromExcel}
            disabled={seeding || syncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
          >
            {seeding ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Seeding from Excel...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Wipe &amp; Seed from Excel
              </>
            )}
          </button>
          {seedResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
              <p className="font-semibold text-green-800 mb-1">Seed complete ({seedResult.duration}s)</p>
              <ul className="text-green-700 space-y-1">
                <li>Excel rows read: {seedResult.stats?.excelRows}</li>
                <li>Employees created: {seedResult.stats?.employees}</li>
                <li>Devices created: {seedResult.stats?.devices}</li>
                {seedResult.stats?.errors > 0 && (
                  <li className="text-red-600">Errors: {seedResult.stats.errors}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* NinjaOne Sync Button */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sync from NinjaOne</h3>
            <p className="text-sm text-gray-600">
              Pull latest device details and hardware specs from NinjaOne. 
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

        {/* Auvik Sync (Phase 17, optional — only renders when configured) */}
        {auvikConfigured && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-purple-500">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <NetworkIcon className="w-5 h-5 text-purple-600" />
                Sync from Auvik
              </h3>
              <p className="text-sm text-gray-600">
                Pull network devices and topology connections from Auvik. Each
                Auvik network maps to an office via the office&apos;s Auvik
                Network ID. Devices flagged as &quot;manually overridden&quot;
                are never modified by this sync. Runs daily at 4:00 AM UTC.
              </p>
            </div>
            <button
              onClick={handleAuvikSync}
              disabled={auvikSyncing || syncing || seeding}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
            >
              {auvikSyncing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Syncing from Auvik...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Sync from Auvik
                </>
              )}
            </button>
            {auvikResult && (
              <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm">
                <p className="font-semibold text-purple-800 mb-1">
                  Auvik sync complete ({auvikResult.duration}s)
                </p>
                <ul className="text-purple-700 space-y-1">
                  <li>Networks processed: {auvikResult.networksProcessed}</li>
                  {auvikResult.networksSkipped > 0 && (
                    <li className="text-amber-600">
                      Networks skipped (no matching office): {auvikResult.networksSkipped}
                    </li>
                  )}
                  <li>Devices upserted: {auvikResult.devicesUpserted}</li>
                  {auvikResult.devicesSkipped > 0 && (
                    <li>Devices skipped (overridden / unmapped type): {auvikResult.devicesSkipped}</li>
                  )}
                  {auvikResult.devicesFailed > 0 && (
                    <li className="text-red-600">Devices failed: {auvikResult.devicesFailed}</li>
                  )}
                  <li>Connections upserted: {auvikResult.connectionsUpserted}</li>
                  {auvikResult.connectionsFailed > 0 && (
                    <li className="text-red-600">Connections failed: {auvikResult.connectionsFailed}</li>
                  )}
                </ul>
                {auvikResult.errors && auvikResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-amber-600 font-medium">
                      View warnings ({auvikResult.errors.length})
                    </summary>
                    <ul className="mt-1 text-xs text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                      {auvikResult.errors.map((e: string, i: number) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/* Intune/Entra Sync */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-teal-500">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Sync from Intune / Entra</h3>
            <p className="text-sm text-gray-600">
              Pull managed devices from Microsoft Intune that are not in NinjaOne. Automatically
              assigns devices to employees using the Intune user principal name. Run this after
              NinjaOne sync to fill in remaining gaps.
            </p>
          </div>
          <button
            onClick={handleIntuneSync}
            disabled={intuneSync || syncing || seeding}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
          >
            {intuneSync ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Syncing from Intune...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Sync from Intune / Entra
              </>
            )}
          </button>
          {intuneResult && (
            <div className="mt-4 p-4 bg-teal-50 border border-teal-200 rounded-lg text-sm">
              <p className="font-semibold text-teal-800 mb-1">
                Intune sync complete ({intuneResult.duration}s)
              </p>
              <ul className="text-teal-700 space-y-1">
                <li>Total Intune devices: {intuneResult.totalIntuneDevices}</li>
                <li>Synced/updated: {intuneResult.recordsSynced}</li>
                <li>Skipped (duplicates): {intuneResult.recordsSkipped}</li>
                {intuneResult.recordsNonCompliant > 0 && (
                  <li className="text-amber-600">
                    Non-compliant (excluded): {intuneResult.recordsNonCompliant}
                  </li>
                )}
                <li>Employees auto-matched: {intuneResult.employeesMatched}</li>
                {intuneResult.recordsFailed > 0 && (
                  <li className="text-red-600">Failed: {intuneResult.recordsFailed}</li>
                )}
              </ul>
              {intuneResult.errors && intuneResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-600 font-medium">
                    View errors ({intuneResult.errors.length})
                  </summary>
                  <ul className="mt-1 text-xs text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                    {intuneResult.errors.map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Assign Devices from Excel */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-indigo-500">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Assign Devices from Excel</h3>
            <p className="text-sm text-gray-600">
              Match NinjaOne devices to employees using the &quot;PC Names Active / Enrolled&quot; column 
              from Excel. Run this after NinjaOne sync to link devices to their owners.
            </p>
          </div>
          <button
            onClick={handleAssignDevices}
            disabled={assigning || syncing || seeding}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
          >
            {assigning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Assigning Devices...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Assign Devices from Excel
              </>
            )}
          </button>
          {assignResult && (
            <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
              <p className="font-semibold text-indigo-800 mb-1">
                Assignment complete ({assignResult.duration}s)
              </p>
              <ul className="text-indigo-700 space-y-1">
                <li>Devices matched: {assignResult.stats?.matched}</li>
                <li>Already assigned: {assignResult.stats?.alreadyAssigned}</li>
                {assignResult.stats?.unmatched > 0 && (
                  <li className="text-amber-600">Unmatched names: {assignResult.stats.unmatched}</li>
                )}
              </ul>
              {assignResult.assignments && assignResult.assignments.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-indigo-600 font-medium">
                    View assignments ({assignResult.assignments.length})
                  </summary>
                  <ul className="mt-1 text-xs text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                    {assignResult.assignments.map((a: string, i: number) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
              {assignResult.unmatchedNames && assignResult.unmatchedNames.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-amber-600 font-medium">
                    View unmatched ({assignResult.unmatchedNames.length})
                  </summary>
                  <ul className="mt-1 text-xs text-gray-700 space-y-0.5 max-h-40 overflow-y-auto">
                    {assignResult.unmatchedNames.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
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
                            {log.sync_type === 'ninjaone'
                              ? 'NinjaOne'
                              : log.sync_type === 'intune'
                              ? 'Intune / Entra'
                              : log.sync_type === 'auvik'
                              ? 'Auvik'
                              : log.sync_type.toUpperCase()}
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

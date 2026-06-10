'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Settings as SettingsIcon, Database, Shield, RefreshCw, CheckCircle, XCircle, Loader2, Building2, ChevronRight } from 'lucide-react'

interface ServiceStatus {
  name: string
  status: 'connected' | 'error'
  latencyMs?: number
  error?: string
}

interface HealthResponse {
  status: 'healthy' | 'degraded'
  services: ServiceStatus[]
}

function StatusBadge({ service }: { service: ServiceStatus | undefined; }) {
  if (!service) {
    return <span className="text-gray-400 text-sm">Unknown</span>
  }

  if (service.status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-green-600 font-medium">
        <CheckCircle className="w-4 h-4" />
        Connected
        {service.latencyMs != null && (
          <span className="text-xs text-gray-400 font-normal">({service.latencyMs}ms)</span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
      <XCircle className="w-4 h-4" />
      Error
    </span>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'admin'

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const runHealthCheck = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health')
      const data: HealthResponse = await res.json()
      setHealth(data)
      setLastChecked(new Date())
    } catch {
      setHealth({
        status: 'degraded',
        services: [
          { name: 'Supabase', status: 'error', error: 'Health check request failed' },
          { name: 'NinjaOne', status: 'error', error: 'Health check request failed' },
        ],
      })
      setLastChecked(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    runHealthCheck()
  }, [runHealthCheck])

  const supabaseStatus = health?.services.find((s) => s.name === 'Supabase')
  const ninjaStatus = health?.services.find((s) => s.name === 'NinjaOne')

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Settings</h1>
              <p className="text-gray-600">Configure integrations and system settings</p>
            </div>
            <div className="flex items-center gap-3">
              {lastChecked && (
                <span className="text-xs text-gray-400">
                  Checked {lastChecked.toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={runHealthCheck}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Check Health
              </button>
            </div>
          </div>
        </div>

        {/* Overall Status Banner */}
        {health && !loading && (
          <div className={`rounded-lg p-4 mb-6 flex items-center gap-3 ${
            health.status === 'healthy'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}>
            {health.status === 'healthy' ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-green-800 font-medium">All systems operational</p>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-red-800 font-medium">One or more services have issues</p>
              </>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Supabase Settings */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className={`rounded-lg p-3 mr-4 ${
                supabaseStatus?.status === 'connected' ? 'bg-green-100' : supabaseStatus?.status === 'error' ? 'bg-red-100' : 'bg-gray-100'
              }`}>
                <Database className={`w-6 h-6 ${
                  supabaseStatus?.status === 'connected' ? 'text-green-600' : supabaseStatus?.status === 'error' ? 'text-red-600' : 'text-gray-400'
                }`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Supabase Database</h3>
                <p className="text-sm text-gray-600">Central database for all employee and device data</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-gray-600">Status:</span>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : (
                  <StatusBadge service={supabaseStatus} />
                )}
              </div>
              {supabaseStatus?.error && (
                <div className="py-2 border-b border-gray-200">
                  <p className="text-xs text-red-500">{supabaseStatus.error}</p>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-4">
                Configure in .env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
              </p>
            </div>
          </div>

          {/* NinjaOne Settings */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className={`rounded-lg p-3 mr-4 ${
                ninjaStatus?.status === 'connected' ? 'bg-purple-100' : ninjaStatus?.status === 'error' ? 'bg-red-100' : 'bg-gray-100'
              }`}>
                <Shield className={`w-6 h-6 ${
                  ninjaStatus?.status === 'connected' ? 'text-purple-600' : ninjaStatus?.status === 'error' ? 'text-red-600' : 'text-gray-400'
                }`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">NinjaOne</h3>
                <p className="text-sm text-gray-600">Device hardware and OS sync</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                <span className="text-gray-600">Status:</span>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : (
                  <StatusBadge service={ninjaStatus} />
                )}
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Device sync:</span>
                <span className="font-medium text-purple-600">Enabled</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Schedule:</span>
                <span className="font-medium text-gray-900">Daily at 3:00 AM UTC</span>
              </div>
              {ninjaStatus?.error && (
                <div className="py-2 border-b border-gray-200">
                  <p className="text-xs text-red-500">{ninjaStatus.error}</p>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-4">
                Configure in .env: NINJA_CLIENT_ID, NINJA_CLIENT_SECRET, NINJA_REGION
              </p>
            </div>
          </div>
        </div>

        {/* Admin Tools */}
        {isAdmin && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Tools</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <Link
                href="/settings/offices"
                className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="bg-blue-100 rounded-lg p-3 mr-4">
                      <Building2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Office Management</h3>
                      <p className="text-sm text-gray-600">
                        Manage the 11 offices, addresses, and lat/lng coordinates.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Setup Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">Setup Instructions</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
            <li>Copy .env.example to .env and fill in your credentials</li>
            <li>Run the Supabase schema.sql file to create database tables</li>
            <li>Set up NinjaOne API credentials for device sync</li>
            <li>Deploy to Vercel for automated daily NinjaOne sync via cron</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

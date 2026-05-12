import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

interface ServiceStatus {
  name: string
  status: 'connected' | 'error'
  latencyMs?: number
  error?: string
}

async function checkSupabase(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const supabase = getServiceSupabase()
    const { error } = await supabase.from('employees').select('id', { count: 'exact', head: true })
    if (error) throw error
    return { name: 'Supabase', status: 'connected', latencyMs: Date.now() - start }
  } catch (err) {
    return {
      name: 'Supabase',
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

async function checkNinjaOne(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const clientId = process.env.NINJA_CLIENT_ID
    const clientSecret = process.env.NINJA_CLIENT_SECRET
    const region = process.env.NINJA_REGION || 'us'

    if (!clientId || !clientSecret) {
      return { name: 'NinjaOne', status: 'error', error: 'Missing NINJA_CLIENT_ID or NINJA_CLIENT_SECRET' }
    }

    const regionMap: Record<string, string> = {
      us: 'https://app.ninjarmm.com',
      eu: 'https://eu.ninjarmm.com',
      oc: 'https://oc.ninjarmm.com',
      ca: 'https://ca.ninjarmm.com',
    }
    const baseUrl = regionMap[region] || regionMap.us

    const response = await fetch(`${baseUrl}/ws/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'monitoring management',
      }),
    })

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`)
    }

    return { name: 'NinjaOne', status: 'connected', latencyMs: Date.now() - start }
  } catch (err) {
    return {
      name: 'NinjaOne',
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function GET() {
  const [supabase, ninjaOne] = await Promise.all([
    checkSupabase(),
    checkNinjaOne(),
  ])

  const services = [supabase, ninjaOne]
  const allHealthy = services.every((s) => s.status === 'connected')

  return NextResponse.json(
    { status: allHealthy ? 'healthy' : 'degraded', services },
    { status: allHealthy ? 200 : 503 }
  )
}

import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { DEV_AUTH_DISABLED } from '@/lib/dev-auth'
import { canAccessNetwork } from '@/lib/network-access'

export async function isNetworkOwnerRequest(): Promise<boolean> {
  if (DEV_AUTH_DISABLED) return true
  const session = await getServerSession(authOptions)
  return canAccessNetwork(session?.user?.email)
}

export async function requireNetworkOwner(): Promise<NextResponse | null> {
  if (await isNetworkOwnerRequest()) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

import { getServerSession } from 'next-auth/next'
import { notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { canAccessNetwork } from '@/lib/network-access'

export default async function NetworkLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!canAccessNetwork(session?.user?.email)) {
    notFound()
  }
  return children
}

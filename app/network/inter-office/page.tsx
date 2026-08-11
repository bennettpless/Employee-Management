'use client'

/**
 * Company-wide inter-office topology page. Draw the site-to-site links
 * (SonicWall VPN / Cloud Secure Edge / MPLS) between offices and export the
 * map. Data persists to the `office_connections` table and
 * `offices.layout_x/_y` via `/api/network/inter-office/topology`. Kill-switch:
 * NEXT_PUBLIC_TEMP_TOPOLOGY=0 hides the page (see `lib/temp-topology/flag.ts`).
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Share2, EyeOff } from 'lucide-react'
import { isTempTopologyEnabled } from '@/lib/temp-topology/flag'

const InterOfficeMap = dynamic(
  () => import('@/components/temp-topology/InterOfficeMap'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[640px] bg-gray-100 animate-pulse rounded-xl shadow-md" />
    ),
  }
)

export default function InterOfficeTopologyPage() {
  if (!isTempTopologyEnabled()) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Link
            href="/network"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Network
          </Link>
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <EyeOff className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-700 font-medium mb-1">
              Inter-office topology page is hidden.
            </p>
            <p className="text-sm text-gray-500">
              Set <code>NEXT_PUBLIC_TEMP_TOPOLOGY=1</code> (or remove the var)
              and restart the dev server to re-enable this page. Your saved
              office_connections rows are not affected.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/network"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Network
          </Link>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Share2 className="w-8 h-8 text-purple-600" />
                Inter-Office Topology
              </h1>
              <p className="text-gray-600">
                Draw the site-to-site links between offices (SonicWall VPN,
                Cloud Secure Edge, MPLS) and export the map. Per-office device
                maps live on each office page.
              </p>
            </div>
          </div>
        </div>

        <InterOfficeMap />
      </div>
    </div>
  )
}

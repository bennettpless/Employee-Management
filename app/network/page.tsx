'use client'

import Link from 'next/link'
import { ArrowLeft, Network } from 'lucide-react'

export default function NetworkPage() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Network</h1>
          <p className="text-gray-600">
            Geographic map of all 11 offices and per-office topology diagrams.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <div className="bg-purple-100 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Network className="w-10 h-10 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Coming soon</h2>
          <p className="text-gray-600 max-w-xl mx-auto">
            The Network feature is being built in Phases 13–18 of the v2 plan. It will include
            office records, manual + CSV/XLSX import, optional Auvik sync, a geographic map,
            per-office topology diagrams, and full Excel/CSV/JSON/PNG/PDF exports.
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Key, Loader2, Users } from 'lucide-react'

interface License {
  software_name: string
  user_count: number
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLicenses()
  }, [])

  const fetchLicenses = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/licenses')
      const data = await response.json()
      setLicenses(data.licenses || [])
    } catch (error) {
      console.error('Error fetching licenses:', error)
    } finally {
      setLoading(false)
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Software Licenses</h1>
          <p className="text-gray-600">View all licenses and user assignments</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          </div>
        ) : licenses.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Key className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No licenses found in the database</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Software Name
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Users Assigned
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {licenses.map((license, index) => (
                    <tr 
                      key={license.software_name} 
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="bg-blue-100 rounded-lg p-2 mr-3">
                            <Key className="w-5 h-5 text-blue-600" />
                          </div>
                          <span className="font-medium text-gray-900">{license.software_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Users className="w-5 h-5 text-gray-400 mr-2" />
                          <span className="text-gray-900 font-semibold">{license.user_count}</span>
                          <span className="text-gray-500 ml-1">
                            {license.user_count === 1 ? 'user' : 'users'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Total: <span className="font-semibold text-gray-900">{licenses.length}</span> unique licenses
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}




'use client'

import Link from 'next/link'
import { ArrowLeft, Settings as SettingsIcon, Database, Shield } from 'lucide-react'

export default function SettingsPage() {
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Settings</h1>
          <p className="text-gray-600">Configure integrations and system settings</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Supabase Settings */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className="bg-green-100 rounded-lg p-3 mr-4">
                <Database className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Supabase Database</h3>
                <p className="text-sm text-gray-600">Central database for all employee and device data</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-green-600">Connected</span>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                Configure in .env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
              </p>
            </div>
          </div>

          {/* NinjaOne Settings */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center mb-4">
              <div className="bg-purple-100 rounded-lg p-3 mr-4">
                <Shield className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">NinjaOne</h3>
                <p className="text-sm text-gray-600">Device management and software inventory</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Device sync:</span>
                <span className="font-medium text-purple-600">Enabled</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Schedule:</span>
                <span className="font-medium text-gray-900">Daily at 3:00 AM UTC</span>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                Configure in .env: NINJA_CLIENT_ID, NINJA_CLIENT_SECRET, NINJA_REGION
              </p>
            </div>
          </div>
        </div>

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

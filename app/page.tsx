import Link from 'next/link'
import { getServerSession } from 'next-auth/next'
import { Server, Network, Settings, Users, Package, HelpCircle } from 'lucide-react'
import { authOptions } from '@/lib/auth'
import { canAccessNetwork } from '@/lib/network-access'

export default async function Home() {
  const session = await getServerSession(authOptions)
  const showNetwork = canAccessNetwork(session?.user?.email)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Asset Tracking System
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {showNetwork
              ? 'Unified employee, device, and network inventory across all offices. Track who has what equipment and how every site is wired together.'
              : 'Unified employee and device inventory across all offices. Track who has what equipment.'}
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          <Link href="/employees" className="group block h-full">
            <div className="h-full bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-blue-500">
              <div className="flex items-center mb-4">
                <div className="bg-blue-100 rounded-lg p-3 group-hover:bg-blue-500 transition-colors duration-300">
                  <Users className="w-8 h-8 text-blue-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Employees</h2>
              </div>
              <p className="text-gray-600">
                Active employees from onboarding sync. New hires appear here automatically; edit to fix typos.
              </p>
            </div>
          </Link>

          <Link href="/devices" className="group block h-full">
            <div className="h-full bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-green-500">
              <div className="flex items-center mb-4">
                <div className="bg-green-100 rounded-lg p-3 group-hover:bg-green-500 transition-colors duration-300">
                  <Server className="w-8 h-8 text-green-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Devices</h2>
              </div>
              <p className="text-gray-600">
                Inventory of monitors, laptops, desktops, and TVs — who has what device, its status, warranty, and repair history.
              </p>
            </div>
          </Link>

          <Link href="/stock" className="group block h-full">
            <div className="h-full bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-amber-500">
              <div className="flex items-center mb-4">
                <div className="bg-amber-100 rounded-lg p-3 group-hover:bg-amber-500 transition-colors duration-300">
                  <Package className="w-8 h-8 text-amber-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Stock</h2>
              </div>
              <p className="text-gray-600">
                Purchase lots, remaining stock value, and monthly office allocation reports for accounting.
              </p>
            </div>
          </Link>

          {showNetwork && (
          <Link href="/network" className="group block h-full">
            <div className="h-full bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-purple-500">
              <div className="flex items-center mb-4">
                <div className="bg-purple-100 rounded-lg p-3 group-hover:bg-purple-500 transition-colors duration-300">
                  <Network className="w-8 h-8 text-purple-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Network</h2>
              </div>
              <p className="text-gray-600">
                Geographic map of all offices and per-office topology of switches, access points, firewalls, and servers.
              </p>
            </div>
          </Link>
          )}

          <Link href="/settings" className="group block h-full">
            <div className="h-full bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-gray-500">
              <div className="flex items-center mb-4">
                <div className="bg-gray-100 rounded-lg p-3 group-hover:bg-gray-500 transition-colors duration-300">
                  <Settings className="w-8 h-8 text-gray-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Settings</h2>
              </div>
              <p className="text-gray-600">
                Configure integrations, set up sync schedules, and customize system settings.
              </p>
            </div>
          </Link>

          <Link href="/faq" className="group block h-full">
            <div className="h-full bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-indigo-500">
              <div className="flex items-center mb-4">
                <div className="bg-indigo-100 rounded-lg p-3 group-hover:bg-indigo-500 transition-colors duration-300">
                  <HelpCircle className="w-8 h-8 text-indigo-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">FAQ</h2>
              </div>
              <p className="text-gray-600">
                How sign-in, sync, stock lots, and reports work.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}


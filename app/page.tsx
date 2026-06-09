import Link from 'next/link'
import Script from 'next/script'
import { Users, Server, Network, Settings, RefreshCw, Bot } from 'lucide-react'

export default function Home() {
  const agentUrl = process.env.IT_RESPONSE_AGENT_URL?.replace(/\/$/, '')
  const agentApiKey = process.env.IT_RESPONSE_AGENT_API_KEY
  const agentConfigured = Boolean(agentUrl && agentApiKey)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Employee Management System
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Unified employee, device, and network inventory across all 11 offices.
            Track who has what equipment and how every site is wired together.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          <Link href="/employees" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-blue-500">
              <div className="flex items-center mb-4">
                <div className="bg-blue-100 rounded-lg p-3 group-hover:bg-blue-500 transition-colors duration-300">
                  <Users className="w-8 h-8 text-blue-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Employees</h2>
              </div>
              <p className="text-gray-600">
                View and manage all employees. Filter by department, office, and employment status.
              </p>
            </div>
          </Link>

          <Link href="/devices" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-green-500">
              <div className="flex items-center mb-4">
                <div className="bg-green-100 rounded-lg p-3 group-hover:bg-green-500 transition-colors duration-300">
                  <Server className="w-8 h-8 text-green-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Devices</h2>
              </div>
              <p className="text-gray-600">
                Track all devices synced from NinjaOne and Intune, hardware specs, and current assignment to employees.
              </p>
            </div>
          </Link>

          <Link href="/network" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-purple-500">
              <div className="flex items-center mb-4">
                <div className="bg-purple-100 rounded-lg p-3 group-hover:bg-purple-500 transition-colors duration-300">
                  <Network className="w-8 h-8 text-purple-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Network</h2>
              </div>
              <p className="text-gray-600">
                Geographic map of all 11 offices and per-office topology of switches, access points, firewalls, and servers.
              </p>
            </div>
          </Link>

          <Link href="/sync" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-cyan-500">
              <div className="flex items-center mb-4">
                <div className="bg-cyan-100 rounded-lg p-3 group-hover:bg-cyan-500 transition-colors duration-300">
                  <RefreshCw className="w-8 h-8 text-cyan-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Sync Status</h2>
              </div>
              <p className="text-gray-600">
                Monitor data synchronization from NinjaOne. Trigger manual sync or view sync history.
              </p>
            </div>
          </Link>

          <Link href="/response-agent" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-rose-500">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="bg-rose-100 rounded-lg p-3 group-hover:bg-rose-500 transition-colors duration-300">
                    <Bot className="w-8 h-8 text-rose-600 group-hover:text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 ml-4">IT Response Agent</h2>
                </div>
                <span
                  id="ai-review-badge"
                  className="inline-flex min-w-[1.5rem] h-6 px-2 items-center justify-center rounded-full bg-rose-600 text-white text-xs font-semibold empty:hidden"
                  aria-label="Pending AI responses"
                />
              </div>
              <p className="text-gray-600">
                Review AI-recommended responses to NinjaOne tickets. Accept, edit, reject, or forward replies to users.
              </p>
            </div>
          </Link>

          <Link href="/settings" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-gray-500">
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
        </div>

        {agentConfigured && (
          <Script
            src={`${agentUrl}/embed.js`}
            strategy="afterInteractive"
            data-api-url={agentUrl}
            data-api-key={agentApiKey}
            data-poll-interval="30"
          />
        )}

        {/* Key Features Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mt-12">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Key Features</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-lg p-2 mr-4">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Direct Employee Management</h4>
                <p className="text-gray-600 text-sm">Add, edit, and manage employees directly in the application</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-lg p-2 mr-4">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">NinjaOne Device Tracking</h4>
                <p className="text-gray-600 text-sm">Hardware specs, OS, and current owner pulled from NinjaOne and Intune</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-lg p-2 mr-4">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Advanced Filtering</h4>
                <p className="text-gray-600 text-sm">Filter employees by department, office location, and employment status</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-lg p-2 mr-4">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Network Inventory</h4>
                <p className="text-gray-600 text-sm">Switches, APs, firewalls, and servers tracked per office with topology diagrams</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-lg p-2 mr-4">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Automated Updates</h4>
                <p className="text-gray-600 text-sm">Keep employee status up-to-date with new hires and terminations</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-lg p-2 mr-4">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Geographic Map</h4>
                <p className="text-gray-600 text-sm">See all offices on a single map with device counts and links into each site</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


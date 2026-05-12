import Link from 'next/link'
import { Users, Server, HardDrive, Key, Settings, RefreshCw } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Employee Management System
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Unified employee and device management powered by NinjaOne.
            Keep track of employees, devices, software, and licenses all in one place.
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
                Track all devices from NinjaOne, see who they're assigned to, and view installed software on each device.
              </p>
            </div>
          </Link>

          <Link href="/software" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-purple-500">
              <div className="flex items-center mb-4">
                <div className="bg-purple-100 rounded-lg p-3 group-hover:bg-purple-500 transition-colors duration-300">
                  <HardDrive className="w-8 h-8 text-purple-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Software</h2>
              </div>
              <p className="text-gray-600">
                View all software across your organization. See versions, which devices have which versions, and identify who needs updates.
              </p>
            </div>
          </Link>

          <Link href="/licenses" className="group">
            <div className="bg-white rounded-xl shadow-lg p-8 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-transparent hover:border-orange-500">
              <div className="flex items-center mb-4">
                <div className="bg-orange-100 rounded-lg p-3 group-hover:bg-orange-500 transition-colors duration-300">
                  <Key className="w-8 h-8 text-orange-600 group-hover:text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 ml-4">Licenses</h2>
              </div>
              <p className="text-gray-600">
                Manage software licenses, track seat usage, expiration dates, and assign licenses to employees.
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
                <p className="text-gray-600 text-sm">See all devices and software assigned to each employee</p>
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
                <h4 className="font-semibold text-gray-900 mb-1">License Management</h4>
                <p className="text-gray-600 text-sm">Track software licenses, usage, and expiration dates</p>
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
                <h4 className="font-semibold text-gray-900 mb-1">Software Inventory</h4>
                <p className="text-gray-600 text-sm">Track software versions across devices and identify update needs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


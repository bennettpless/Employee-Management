'use client'

import Link from 'next/link'
import { User, Mail, Briefcase, MapPin, Phone, Server } from 'lucide-react'
import { Employee } from '@/lib/types'

interface EmployeeCardProps {
  employee: Employee & {
    devices?: { count: number }[]
  }
}

export default function EmployeeCard({ employee }: EmployeeCardProps) {
  // Extract device count from the devices array
  let deviceCount = 0
  
  if (employee.devices) {
    if (Array.isArray(employee.devices)) {
      // Check if it's an array of count objects: [{count: 5}]
      if (employee.devices.length > 0) {
        const firstItem = employee.devices[0] as any
        if (firstItem && typeof firstItem === 'object' && 'count' in firstItem) {
          deviceCount = firstItem.count || 0
        } else {
          // It's an array of actual devices, count them
          deviceCount = employee.devices.length
        }
      }
    } else if (typeof employee.devices === 'object' && 'count' in employee.devices) {
      // Could be {count: 5}
      deviceCount = (employee.devices as any).count || 0
    }
  }
  

  const statusColors = {
    active: 'bg-green-100 text-green-800 border-green-200',
    terminated: 'bg-red-100 text-red-800 border-red-200',
    on_leave: 'bg-yellow-100 text-yellow-800 border-yellow-200'
  }

  return (
    <Link href={`/employees/${employee.id}`}>
      <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 p-6 border-2 border-transparent hover:border-blue-500 cursor-pointer">
        {/* Header with Photo and Name */}
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="ml-4 flex-1">
            <h3 className="text-lg font-bold text-gray-900">
              {employee.display_name || `${employee.first_name} ${employee.last_name}`}
            </h3>
            <div className="flex items-center text-sm text-gray-600 mt-1">
              <Mail className="w-4 h-4 mr-1" />
              {employee.email}
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[employee.employment_status]}`}>
            {employee.employment_status}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4">
          {employee.job_title && (
            <div className="flex items-center text-sm text-gray-700">
              <Briefcase className="w-4 h-4 mr-2 text-gray-400" />
              {employee.job_title}
            </div>
          )}
          {employee.department && (
            <div className="flex items-center text-sm text-gray-700">
              <div className="w-4 h-4 mr-2 flex items-center justify-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              </div>
              {employee.department}
            </div>
          )}
          {employee.office_location && (
            <div className="flex items-center text-sm text-gray-700">
              <MapPin className="w-4 h-4 mr-2 text-gray-400" />
              {employee.office_location}
            </div>
          )}
          {employee.phone_number && (
            <div className="flex items-center text-sm text-gray-700">
              <Phone className="w-4 h-4 mr-2 text-gray-400" />
              {employee.phone_number}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-start pt-4 border-t border-gray-200">
          <div className="flex items-center text-sm text-gray-600">
            <Server className="w-4 h-4 mr-1" />
            <span className="font-semibold">{deviceCount}</span>
            <span className="ml-1">devices</span>
          </div>
        </div>
      </div>
    </Link>
  )
}


'use client'

import { Key } from 'lucide-react'
import { LicenseAssignment } from '@/lib/types'
import { format } from 'date-fns'

interface EmployeeLicensesTabProps {
  licenseAssignments: LicenseAssignment[]
}

export default function EmployeeLicensesTab({
  licenseAssignments,
}: EmployeeLicensesTabProps) {
  if (licenseAssignments.length === 0) {
    return (
      <div className="text-center py-12">
        <Key className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">No licenses assigned to this employee</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {licenseAssignments.map((assignment: any) => (
        <div key={assignment.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-semibold text-gray-900">{assignment.license.software_name}</h4>
            {assignment.revoked_date ? (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                Revoked
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Active
              </span>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">License Type:</span>
              <span className="ml-2 font-medium text-gray-900">{assignment.license.license_type}</span>
            </div>
            <div>
              <span className="text-gray-600">Assigned:</span>
              <span className="ml-2 font-medium text-gray-900">
                {format(new Date(assignment.assigned_date), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
          {assignment.notes && (
            <p className="text-sm text-gray-600 mt-2">{assignment.notes}</p>
          )}
        </div>
      ))}
    </div>
  )
}

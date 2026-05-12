'use client'

import { Loader2, AlertTriangle, UserMinus } from 'lucide-react'

interface OffboardModalProps {
  employeeName: string
  offboarding: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function OffboardModal({
  employeeName,
  offboarding,
  onConfirm,
  onClose,
}: OffboardModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-4">
          Offboard Employee
        </h2>
        <p className="text-gray-700 mb-6 text-center">
          Are you sure you want to offboard <strong>{employeeName}</strong>?
        </p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800 font-semibold mb-2">This action will:</p>
          <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
            <li>Set the employee status to terminated</li>
            <li>Unassign all devices (devices will remain in the database)</li>
          </ul>
          <p className="text-sm text-yellow-800 font-semibold mt-3">This action cannot be undone.</p>
        </div>
        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            disabled={offboarding}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={offboarding}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {offboarding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Offboarding...
              </>
            ) : (
              <>
                <UserMinus className="w-4 h-4 mr-2" />
                Confirm Offboard
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

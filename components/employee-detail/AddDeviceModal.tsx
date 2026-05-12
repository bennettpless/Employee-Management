'use client'

import { Loader2, X, Plus } from 'lucide-react'

interface AddDeviceModalProps {
  newDeviceForm: { device_name: string; device_type: string }
  setNewDeviceForm: (form: { device_name: string; device_type: string }) => void
  addingDevice: boolean
  onAddDevice: () => void
  onClose: () => void
}

export default function AddDeviceModal({
  newDeviceForm,
  setNewDeviceForm,
  addingDevice,
  onAddDevice,
  onClose,
}: AddDeviceModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Add Device</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={addingDevice}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newDeviceForm.device_name}
              onChange={(e) => setNewDeviceForm({ ...newDeviceForm, device_name: e.target.value })}
              placeholder="e.g., ATL-013274415057"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={addingDevice}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Device Type (optional)
            </label>
            <input
              type="text"
              value={newDeviceForm.device_type}
              onChange={(e) => setNewDeviceForm({ ...newDeviceForm, device_type: e.target.value })}
              placeholder="e.g., Workstation, Laptop"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={addingDevice}
            />
            <p className="text-xs text-gray-500 mt-1">
              If not provided, will be determined when matched with NinjaOne
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-4 mt-6">
          {addingDevice && !newDeviceForm.device_name.trim() ? (
            <div className="flex items-center text-gray-600 w-full justify-center py-2">
              <Loader2 className="w-5 h-5 mr-2 animate-spin text-blue-600" />
              <span className="font-medium">Syncing with NinjaOne...</span>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  if (!addingDevice) {
                    onClose()
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={addingDevice}
              >
                Cancel
              </button>
              <button
                onClick={onAddDevice}
                disabled={addingDevice || !newDeviceForm.device_name.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
              >
                {addingDevice ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Device
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

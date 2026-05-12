'use client'

import { Loader2, X, Save } from 'lucide-react'

interface EditEmployeeModalProps {
  editForm: Record<string, string>
  setEditForm: (form: Record<string, string>) => void
  saving: boolean
  onSave: () => void
  onClose: () => void
}

export default function EditEmployeeModal({
  editForm,
  setEditForm,
  saving,
  onSave,
  onClose,
}: EditEmployeeModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Edit Employee Information</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={editForm.email || ''}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={editForm.first_name || ''}
              onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              value={editForm.last_name || ''}
              onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input
              type="text"
              value={editForm.job_title || ''}
              onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={editForm.department || ''}
              onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Department</option>
              <option value="Engineer">Engineer</option>
              <option value="Operations">Operations</option>
              <option value="Admin">Admin</option>
              <option value="HR">HR</option>
              <option value="Executive">Executive</option>
              <option value="Manager">Manager</option>
              <option value="Designer">Designer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Office Location</label>
            <select
              value={editForm.office_location || ''}
              onChange={(e) => setEditForm({ ...editForm, office_location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Office</option>
              <option value="Atlanta">Atlanta</option>
              <option value="Chattanooga">Chattanooga</option>
              <option value="Nashville">Nashville</option>
              <option value="Knoxville">Knoxville</option>
              <option value="Raleigh">Raleigh</option>
              <option value="Charlotte">Charlotte</option>
              <option value="Loudoun">Loudoun</option>
              <option value="Dallas">Dallas</option>
              <option value="Houston">Houston</option>
              <option value="Czech">Czech</option>
              <option value="Remote">Remote</option>
              <option value="Florida">Florida</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={editForm.phone_number || ''}
              onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
            <input
              type="text"
              value={editForm.extension || ''}
              onChange={(e) => setEditForm({ ...editForm, extension: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
            <select
              value={editForm.branch_name || ''}
              onChange={(e) => setEditForm({ ...editForm, branch_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Branch</option>
              <option value="Bennett & Pless Inc">B&P (Bennett & Pless Inc)</option>
              <option value="Bennett & Pless Leicht, LLC">BPL (Bennett & Pless Leicht, LLC)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={editForm.type || ''}
              onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Type</option>
              <option value="Employee">Employee</option>
              <option value="Contract">Contract</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
            <input
              type="text"
              value={editForm.supervisor || ''}
              onChange={(e) => setEditForm({ ...editForm, supervisor: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department Manager</label>
            <input
              type="text"
              value={editForm.dpt_manager || ''}
              onChange={(e) => setEditForm({ ...editForm, dpt_manager: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nick Name</label>
            <input
              type="text"
              value={editForm.nick_name || ''}
              onChange={(e) => setEditForm({ ...editForm, nick_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={editForm.username || ''}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

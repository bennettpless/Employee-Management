'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function OnboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    // Basic Info
    first_name: '',
    last_name: '',
    nick_name: '',
    username: '',
    email: '',
    duplicate_user_email: '',
    phone_number: '',
    extension: '',
    
    // Organization
    branch_name: '',
    office_location: '',
    type: '',
    job_title: '',
    department: '',
    supervisor: '',
    dpt_manager: '',
    
    // Devices
    pc_names_active_enrolled: '',
    pc_type: '',
    potential_unused_device_amount: '',
    potential_unused_devices_date: '',
    
    // Services
    enrolled_in_intune: false,
    ninja_end_user_remote_access: false,
    office_365_mfa: false,
    
    // Software Licenses
    autocad: false,
    autocad_lt: false,
    aec: false,
    bim: false,
    bentley: false,
    hilti: false,
    softrack: false,
    risa: false,
    lucid: false,
    tekla_tedds: false,
    tekla_structural_designer: false,
    tekla_structural_designer_suite: false,
    etabs: false,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.email || !formData.first_name || !formData.last_name) {
      alert('Please fill in required fields: Email, First Name, and Last Name')
      return
    }
    
    try {
      setLoading(true)
      const response = await fetch('/api/employees/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to onboard employee')
      }
      
      alert('Employee onboarded successfully!')
      router.push(`/employees/${data.employee.id}`)
    } catch (error: any) {
      console.error('Error onboarding employee:', error)
      alert(`Error onboarding employee: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link 
            href="/employees" 
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Employees
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Onboard New Employee</h1>
          <p className="text-gray-600 mt-2">Fill in all employee information to add them to the system</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-8">
          {/* Basic Information */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">Basic Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nick Name</label>
                <input
                  type="text"
                  name="nick_name"
                  value={formData.nick_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duplicate User Email</label>
                <input
                  type="email"
                  name="duplicate_user_email"
                  value={formData.duplicate_user_email}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Extension</label>
                <input
                  type="text"
                  name="extension"
                  value={formData.extension}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Organization */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">Organization</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <select
                  name="branch_name"
                  value={formData.branch_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Branch</option>
                  <option value="Bennett & Pless Inc">B&P (Bennett & Pless Inc)</option>
                  <option value="Bennett & Pless Leicht, LLC">BPL (Bennett & Pless Leicht, LLC)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Office Location</label>
                <select
                  name="office_location"
                  value={formData.office_location}
                  onChange={handleChange}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Type</option>
                  <option value="Employee">Employee</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                <input
                  type="text"
                  name="job_title"
                  value={formData.job_title}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
                <input
                  type="text"
                  name="supervisor"
                  value={formData.supervisor}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Manager</label>
                <input
                  type="text"
                  name="dpt_manager"
                  value={formData.dpt_manager}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Devices */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">Devices</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PC Names Active / Enrolled</label>
                <input
                  type="text"
                  name="pc_names_active_enrolled"
                  value={formData.pc_names_active_enrolled}
                  onChange={handleChange}
                  placeholder="e.g., PC1, PC2, PC3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Separate multiple devices with commas</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PC Type</label>
                <input
                  type="text"
                  name="pc_type"
                  value={formData.pc_type}
                  onChange={handleChange}
                  placeholder="e.g., Workstation, Laptop"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Match device order (comma-separated)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Potential Unused Device Amount</label>
                <input
                  type="text"
                  name="potential_unused_device_amount"
                  value={formData.potential_unused_device_amount}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Potential Unused Devices Date</label>
                <input
                  type="text"
                  name="potential_unused_devices_date"
                  value={formData.potential_unused_devices_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">Services</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="enrolled_in_intune"
                  checked={formData.enrolled_in_intune}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Enrolled in Intune</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="ninja_end_user_remote_access"
                  checked={formData.ninja_end_user_remote_access}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Ninja End User Remote Access</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="office_365_mfa"
                  checked={formData.office_365_mfa}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Office 365 MFA</span>
              </label>
            </div>
          </div>

          {/* Software Licenses */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">Software Licenses</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="autocad"
                  checked={formData.autocad}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Autocad</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="autocad_lt"
                  checked={formData.autocad_lt}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Autocad LT</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="aec"
                  checked={formData.aec}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">AEC</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="bim"
                  checked={formData.bim}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">BIM</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="bentley"
                  checked={formData.bentley}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Bentley</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="hilti"
                  checked={formData.hilti}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Hilti</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="softrack"
                  checked={formData.softrack}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Softrack</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="risa"
                  checked={formData.risa}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">RISA</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="lucid"
                  checked={formData.lucid}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Lucid</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="tekla_tedds"
                  checked={formData.tekla_tedds}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Tekla Tedds</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="tekla_structural_designer"
                  checked={formData.tekla_structural_designer}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Tekla Structural Designer</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="tekla_structural_designer_suite"
                  checked={formData.tekla_structural_designer_suite}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Tekla Structural Designer Suite</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="etabs"
                  checked={formData.etabs}
                  onChange={handleChange}
                  className="mr-2 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">eTABS</span>
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            <Link
              href="/employees"
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Onboarding...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Onboard Employee
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

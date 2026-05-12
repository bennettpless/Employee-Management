'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, X } from 'lucide-react'

interface EmployeeFiltersProps {
  onFilterChange: (filters: FilterState) => void
}

export interface FilterState {
  search: string
  status: string
  department: string
  office: string
  branch: string
}

export default function EmployeeFilters({ onFilterChange }: EmployeeFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: '',
    department: '',
    office: '',
    branch: ''
  })

  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    onFilterChange(filters)
  }, [filters, onFilterChange])

  const handleSearchChange = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }))
  }

  const handleStatusChange = (value: string) => {
    setFilters(prev => ({ ...prev, status: value }))
  }

  const handleDepartmentChange = (value: string) => {
    setFilters(prev => ({ ...prev, department: value }))
  }

  const handleOfficeChange = (value: string) => {
    setFilters(prev => ({ ...prev, office: value }))
  }

  const handleBranchChange = (value: string) => {
    setFilters(prev => ({ ...prev, branch: value }))
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: '',
      department: '',
      office: '',
      branch: ''
    })
  }

  const hasActiveFilters = filters.status || filters.department || filters.office || filters.branch

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      {/* Search Bar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-5 h-5" />
          Filters
          {hasActiveFilters && (
            <span className="bg-white text-blue-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
              {(filters.status ? 1 : 0) + 
               (filters.department ? 1 : 0) + 
               (filters.office ? 1 : 0) +
               (filters.branch ? 1 : 0)}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
          >
            <X className="w-5 h-5" />
            Clear
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="grid md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Employment Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="terminated">Terminated</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Department
            </label>
            <select
              value={filters.department}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              <option value="Engineer">Engineer</option>
              <option value="Operations">Operations</option>
              <option value="Admin">Admin</option>
              <option value="HR">HR</option>
              <option value="Executive">Executive</option>
              <option value="Manager">Manager</option>
              <option value="Designer">Designer</option>
            </select>
          </div>

          {/* Office Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Office Location
            </label>
            <select
              value={filters.office}
              onChange={(e) => handleOfficeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Offices</option>
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

          {/* Branch Name Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Branch Name
            </label>
            <select
              value={filters.branch}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Branches</option>
              <option value="Bennett & Pless Inc">B&P (Bennett & Pless Inc)</option>
              <option value="Bennett & Pless Leicht, LLC">BPL (Bennett & Pless Leicht, LLC)</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}


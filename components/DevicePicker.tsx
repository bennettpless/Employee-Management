'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Monitor, ChevronDown, X, Edit3 } from 'lucide-react'

interface AvailableDevice {
  id: string
  device_name: string
  device_type: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  os_name: string | null
  is_in_ninja: boolean
  employee_id: string | null
}

interface DevicePickerProps {
  onSelect: (device: { device_id?: string; device_name?: string; device_type?: string | null }) => void
  placeholder?: string
}

export default function DevicePicker({ onSelect, placeholder = 'Search for a device...' }: DevicePickerProps) {
  const [search, setSearch] = useState('')
  const [devices, setDevices] = useState<AvailableDevice[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualType, setManualType] = useState('')
  const [selected, setSelected] = useState<AvailableDevice | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || manualMode) return
    
    const timer = setTimeout(() => {
      fetchDevices(search)
    }, 300)
    
    return () => clearTimeout(timer)
  }, [search, isOpen, manualMode])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchDevices = async (query: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('search', query.trim())
      const response = await fetch(`/api/devices/available?${params}`)
      const data = await response.json()
      setDevices(data.devices || [])
    } catch (error) {
      console.error('Error fetching devices:', error)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (device: AvailableDevice) => {
    setSelected(device)
    setSearch(device.device_name || '')
    setIsOpen(false)
    onSelect({ device_id: device.id, device_name: device.device_name, device_type: device.device_type })
  }

  const handleManualSubmit = () => {
    if (!manualName.trim()) return
    setSelected(null)
    onSelect({ device_name: manualName.trim(), device_type: manualType.trim() || null })
  }

  const handleClear = () => {
    setSelected(null)
    setSearch('')
    setManualName('')
    setManualType('')
    onSelect({})
  }

  if (manualMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Manual Device Entry</label>
          <button
            type="button"
            onClick={() => { setManualMode(false); handleClear() }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Switch to picker
          </button>
        </div>
        <input
          type="text"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onBlur={handleManualSubmit}
          placeholder="Device name (e.g., LAPTOP-ABC123)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={manualType}
          onChange={(e) => setManualType(e.target.value)}
          onBlur={handleManualSubmit}
          placeholder="Device type (e.g., Laptop, Desktop)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">Device</label>
        <button
          type="button"
          onClick={() => { setManualMode(true); handleClear() }}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <Edit3 className="w-3 h-3" />
          Enter manually
        </button>
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-16 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {(search || selected) && (
            <button type="button" onClick={handleClear} className="p-1 hover:bg-gray-100 rounded" title="Clear selection">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
      </div>
      
      {selected && (
        <div className="mt-1 text-xs text-green-600">
          Selected: {selected.device_name} {selected.serial_number ? `(S/N: ${selected.serial_number})` : ''}
        </div>
      )}
      
      {isOpen && !selected && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
          ) : devices.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              {search ? 'No devices found' : 'Type to search NinjaOne devices'}
            </div>
          ) : (
            devices.map((device) => (
              <button
                key={device.id}
                type="button"
                onClick={() => handleSelect(device)}
                className="w-full px-4 py-2 text-left hover:bg-blue-50 flex items-start gap-3 border-b border-gray-100 last:border-b-0"
              >
                <Monitor className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{device.device_name}</div>
                  <div className="text-xs text-gray-500">
                    {[device.manufacturer, device.model, device.os_name].filter(Boolean).join(' · ') || device.device_type || 'Unknown'}
                  </div>
                  {device.serial_number && (
                    <div className="text-xs text-gray-400">S/N: {device.serial_number}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

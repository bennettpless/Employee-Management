export interface Employee {
  id: string
  entra_id: string
  email: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  job_title: string | null
  department: string | null
  office_location: string | null
  phone_number: string | null
  mobile_phone: string | null
  manager_entra_id: string | null
  dpt_manager: string | null
  employment_status: 'active' | 'terminated' | 'on_leave'
  hire_date: string | null
  termination_date: string | null
  last_synced_at: string
  created_at: string
  updated_at: string
}

export interface Device {
  id: string
  ninja_device_id: string
  employee_id: string | null
  device_name: string | null
  device_type: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  os_name: string | null
  os_version: string | null
  last_seen: string | null
  status: 'active' | 'inactive' | 'retired'
  azure_device_id: string | null
  is_in_ninja: boolean
  last_synced_at: string
  created_at: string
  updated_at: string
  employee?: Employee
}

export interface SyncLog {
  id: string
  sync_type: 'entra_id' | 'ninjaone' | 'intune' | 'auvik' | 'excel'
  status: 'success' | 'partial' | 'failed'
  records_synced: number
  records_failed: number
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
}

export interface PreviousDevice extends Device {
  assignment_date?: string
  unassignment_date?: string | null
  registered_date?: string
}

export interface EmployeeWithRelations extends Employee {
  devices?: Device[]
  previous_devices?: PreviousDevice[]
}

export interface Office {
  id: string
  name: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  auvik_network_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type NetworkDeviceType =
  | 'access_point'
  | 'switch'
  | 'firewall'
  | 'server'
  | 'router'
  | 'other'

export type NetworkDeviceStatus =
  | 'online'
  | 'offline'
  | 'warning'
  | 'critical'
  | 'unknown'

export type NetworkDeviceSource = 'manual' | 'auvik' | 'csv'

export type NetworkLinkType = 'ethernet' | 'fiber' | 'wireless' | 'other'

export interface NetworkDevice {
  id: string
  auvik_device_id: string | null
  office_id: string | null
  name: string
  device_type: NetworkDeviceType
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  firmware_version: string | null
  management_ip: string | null
  management_url: string | null
  mac_address: string | null
  status: NetworkDeviceStatus
  last_seen: string | null
  credentials_vault_ref: string | null
  notes: string | null
  source: NetworkDeviceSource
  is_manually_overridden: boolean
  last_synced_at: string | null
  // Per-office React Flow topology position. NULL on devices that haven't been
  // laid out yet (the topology API auto-places those). Stored as DECIMAL in
  // Postgres; Supabase returns the value as a number for narrow DECIMALs.
  layout_x: number | null
  layout_y: number | null
  created_at: string
  updated_at: string
  office?: Office
}

export interface NetworkDeviceConnection {
  id: string
  source_device_id: string
  target_device_id: string
  source_port: string | null
  target_port: string | null
  link_type: NetworkLinkType | null
  auvik_link_id: string | null
  last_synced_at: string | null
  created_at: string
}

export interface NetworkDeviceWithConnections extends NetworkDevice {
  outgoing_connections?: NetworkDeviceConnection[]
  incoming_connections?: NetworkDeviceConnection[]
}


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
  employment_status: 'active' | 'terminated' | 'on_leave'
  hire_date: string | null
  termination_date: string | null
  last_synced_at: string
  created_at: string
  updated_at: string
}

export type DeviceStatus = 'active' | 'in_stock' | 'repair' | 'decommissioned'

export type AssetType = 'laptop' | 'desktop' | 'monitor' | 'tv' | 'printer' | 'server' | 'other'

export interface Device {
  id: string
  ninja_device_id: string | null
  employee_id: string | null
  device_name: string | null
  device_type: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  asset_tag: string | null
  asset_type: AssetType | null
  department: string | null
  location: string | null
  commissioned_at: string | null
  decommissioned_at: string | null
  warranty_months: number | null
  warranty_end: string | null
  notes: string | null
  os_name: string | null
  os_version: string | null
  last_seen: string | null
  status: DeviceStatus
  azure_device_id: string | null
  is_in_ninja: boolean
  last_synced_at: string
  created_at: string
  updated_at: string
  employee?: Employee
}

export interface DeviceHistoryEntry {
  id: string
  device_id: string
  event_type: 'repair' | 'upgrade' | 'note'
  event_date: string
  description: string
  created_at: string
}

export interface SyncLog {
  id: string
  // `'auvik'` is a dead value as of Phase 22 — the Auvik integration was
  // removed. It stays in the union so historical `sync_logs` rows for past
  // Auvik runs (which the DB still holds) type-check on read; no new code
  // ever writes it.
  sync_type: 'entra_id' | 'ninjaone' | 'intune' | 'auvik' | 'excel' | 'onboarding' | 'device_inventory'
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
  notes: string | null
  status: 'online' | 'offline'
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

export type NetworkDeviceSource = 'manual' | 'csv'

export type NetworkLinkType = 'ethernet' | 'fiber' | 'wireless' | 'other'

export interface NetworkDevice {
  id: string
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
  last_synced_at: string | null
  created_at: string
}

export interface NetworkDeviceWithConnections extends NetworkDevice {
  outgoing_connections?: NetworkDeviceConnection[]
  incoming_connections?: NetworkDeviceConnection[]
}


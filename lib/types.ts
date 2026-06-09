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
  sync_type: 'entra_id' | 'ninjaone' | 'intune' | 'excel'
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


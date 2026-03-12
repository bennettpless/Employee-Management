-- Add columns to employees table to store all Excel data
-- These columns will store additional information from the Excel sheet

ALTER TABLE employees 
  -- Add Excel-specific columns
  ADD COLUMN IF NOT EXISTS username VARCHAR(255),
  ADD COLUMN IF NOT EXISTS nick_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS duplicate_user_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS extension VARCHAR(50),
  ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supervisor VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dpt_manager VARCHAR(255),
  
  -- Service flags
  ADD COLUMN IF NOT EXISTS enrolled_in_intune BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ninja_end_user_remote_access BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS office_365_mfa BOOLEAN DEFAULT false,
  
  -- Store all Excel data as JSON for flexibility
  ADD COLUMN IF NOT EXISTS excel_data JSONB;

-- Update devices table to store Excel device information
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS excel_pc_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS potential_unused_device_amount INTEGER,
  ADD COLUMN IF NOT EXISTS potential_unused_devices_date DATE,
  ADD COLUMN IF NOT EXISTS excel_data JSONB;

-- Create a table to store software license assignments from Excel
CREATE TABLE IF NOT EXISTS employee_software_licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  software_name VARCHAR(255) NOT NULL,
  has_license BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employee_id, software_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_employees_username ON employees(username);
CREATE INDEX IF NOT EXISTS idx_employees_branch_name ON employees(branch_name);
CREATE INDEX IF NOT EXISTS idx_employee_software_licenses_employee ON employee_software_licenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_software_licenses_software ON employee_software_licenses(software_name);

-- Add updated_at trigger for employee_software_licenses
CREATE TRIGGER update_employee_software_licenses_updated_at BEFORE UPDATE ON employee_software_licenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE employee_software_licenses ENABLE ROW LEVEL SECURITY;

-- RLS Policy for employee_software_licenses
CREATE POLICY "Allow authenticated read access" ON employee_software_licenses FOR SELECT TO authenticated USING (true);


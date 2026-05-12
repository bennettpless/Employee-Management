-- Employee Management System Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table (managed via application UI)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entra_id VARCHAR(255) UNIQUE NOT NULL, -- Unique identifier (uses email)
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(255),
    job_title VARCHAR(255),
    department VARCHAR(255),
    office_location VARCHAR(255),
    phone_number VARCHAR(50),
    mobile_phone VARCHAR(50),
    manager_entra_id VARCHAR(255),
    manager_name VARCHAR(255),
    employment_status VARCHAR(50) DEFAULT 'active', -- active, terminated, on_leave
    hire_date DATE,
    termination_date DATE,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Devices table (synced from NinjaOne)
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ninja_device_id VARCHAR(255) UNIQUE NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(100), -- Laptop, Desktop, Phone, Tablet
    manufacturer VARCHAR(100),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    os_name VARCHAR(100),
    os_version VARCHAR(100),
    last_seen TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, retired
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Software catalog (unique software entries)
CREATE TABLE software (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(100),
    publisher VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, version, publisher)
);

-- Device software junction table (many-to-many)
CREATE TABLE device_software (
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    software_id UUID REFERENCES software(id) ON DELETE CASCADE,
    install_date DATE,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (device_id, software_id)
);

-- Tickets table (can be synced from various ticket systems)
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_ticket_id VARCHAR(255) UNIQUE NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    ticket_system VARCHAR(50), -- e.g., 'ninjaone', 'zendesk', 'freshdesk'
    subject TEXT NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'open', -- open, in_progress, resolved, closed
    priority VARCHAR(50), -- low, medium, high, urgent
    category VARCHAR(100),
    created_date TIMESTAMP WITH TIME ZONE,
    updated_date TIMESTAMP WITH TIME ZONE,
    resolved_date TIMESTAMP WITH TIME ZONE,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Licenses table for software license management
CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    software_name VARCHAR(255) NOT NULL,
    license_type VARCHAR(100), -- subscription, perpetual, trial
    license_key TEXT,
    total_seats INTEGER,
    used_seats INTEGER DEFAULT 0,
    vendor VARCHAR(255),
    purchase_date DATE,
    expiration_date DATE,
    cost DECIMAL(10, 2),
    billing_frequency VARCHAR(50), -- monthly, annually, one-time
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- License assignments
CREATE TABLE license_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID REFERENCES licenses(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    assigned_date DATE DEFAULT CURRENT_DATE,
    revoked_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(license_id, employee_id)
);

-- Sync logs to track data synchronization
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL, -- entra_id, ninjaone, tickets, excel
    status VARCHAR(50) NOT NULL, -- success, partial, failed
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER
);

-- Create indexes for better query performance
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_entra_id ON employees(entra_id);
CREATE INDEX idx_employees_status ON employees(employment_status);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_office ON employees(office_location);
CREATE INDEX idx_devices_employee_id ON devices(employee_id);
CREATE INDEX idx_devices_ninja_id ON devices(ninja_device_id);
CREATE INDEX idx_tickets_employee_id ON tickets(employee_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_license_assignments_employee ON license_assignments(employee_id);
CREATE INDEX idx_license_assignments_license ON license_assignments(license_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_licenses_updated_at BEFORE UPDATE ON licenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE software ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_software ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data
CREATE POLICY "Allow authenticated read access" ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON software FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON device_software FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON licenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON license_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON sync_logs FOR SELECT TO authenticated USING (true);

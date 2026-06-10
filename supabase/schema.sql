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

-- Sync logs to track data synchronization
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type VARCHAR(50) NOT NULL CHECK (
        sync_type IN ('entra_id', 'ninjaone', 'intune', 'auvik', 'excel')
    ),
    status VARCHAR(50) NOT NULL, -- success, partial, failed
    records_synced INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER
);

-- Offices: physical office locations (the 11 offices)
CREATE TABLE offices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    auvik_network_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Network devices: APs, switches, firewalls, servers, routers (per office)
CREATE TABLE network_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auvik_device_id VARCHAR(255) UNIQUE,
    office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL CHECK (
        device_type IN ('access_point', 'switch', 'firewall', 'server', 'router', 'other')
    ),
    manufacturer VARCHAR(100),
    model VARCHAR(255),
    serial_number VARCHAR(255),
    firmware_version VARCHAR(100),
    management_ip VARCHAR(45),
    management_url VARCHAR(500),
    mac_address VARCHAR(17),
    status VARCHAR(50) DEFAULT 'unknown' CHECK (
        status IN ('online', 'offline', 'warning', 'critical', 'unknown')
    ),
    last_seen TIMESTAMP WITH TIME ZONE,
    credentials_vault_ref TEXT, -- LastPass entry name; no actual credentials stored
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'auvik', 'csv')),
    is_manually_overridden BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Network device connections: topology edges between network devices
CREATE TABLE network_device_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_device_id UUID NOT NULL REFERENCES network_devices(id) ON DELETE CASCADE,
    target_device_id UUID NOT NULL REFERENCES network_devices(id) ON DELETE CASCADE,
    source_port VARCHAR(50),
    target_port VARCHAR(50),
    link_type VARCHAR(50) CHECK (link_type IN ('ethernet', 'fiber', 'wireless', 'other') OR link_type IS NULL),
    auvik_link_id VARCHAR(255),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (source_device_id, target_device_id, source_port, target_port)
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
CREATE INDEX idx_network_devices_office ON network_devices(office_id);
CREATE INDEX idx_network_devices_type ON network_devices(device_type);
CREATE INDEX idx_network_devices_status ON network_devices(status);
CREATE INDEX idx_network_devices_auvik_id ON network_devices(auvik_device_id);
CREATE INDEX idx_network_connections_source ON network_device_connections(source_device_id);
CREATE INDEX idx_network_connections_target ON network_device_connections(target_device_id);

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

CREATE TRIGGER update_offices_updated_at BEFORE UPDATE ON offices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_network_devices_updated_at BEFORE UPDATE ON network_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_device_connections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data (service role bypasses RLS for writes)
CREATE POLICY "Allow authenticated read access" ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON sync_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON offices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON network_devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON network_device_connections FOR SELECT TO authenticated USING (true);

-- Phase 13 migration: network device inventory schema
--
-- Adds the three tables that the v2 Network feature is built on:
--   * offices                     — physical office locations (the 11 offices),
--                                   incl. address + lat/lng for the geographic map
--   * network_devices             — APs, switches, firewalls, servers, routers, etc.
--   * network_device_connections  — topology edges between devices
--
-- Also extends sync_logs.sync_type to allow 'auvik' so a future Auvik cron can
-- log into the same table as the existing entra_id / ninjaone / intune syncs.
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS, and the sync_logs CHECK
-- constraint is dropped before being re-added.

-- 1. Offices: physical locations (the 11 offices)
CREATE TABLE IF NOT EXISTS public.offices (
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

-- 2. Network devices: APs, switches, firewalls, servers, routers
CREATE TABLE IF NOT EXISTS public.network_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auvik_device_id VARCHAR(255) UNIQUE,
    office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
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
    credentials_vault_ref TEXT,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'auvik', 'csv')),
    is_manually_overridden BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Network device connections: topology edges
CREATE TABLE IF NOT EXISTS public.network_device_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_device_id UUID NOT NULL REFERENCES public.network_devices(id) ON DELETE CASCADE,
    target_device_id UUID NOT NULL REFERENCES public.network_devices(id) ON DELETE CASCADE,
    source_port VARCHAR(50),
    target_port VARCHAR(50),
    link_type VARCHAR(50) CHECK (link_type IN ('ethernet', 'fiber', 'wireless', 'other') OR link_type IS NULL),
    auvik_link_id VARCHAR(255),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (source_device_id, target_device_id, source_port, target_port)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_network_devices_office ON public.network_devices(office_id);
CREATE INDEX IF NOT EXISTS idx_network_devices_type ON public.network_devices(device_type);
CREATE INDEX IF NOT EXISTS idx_network_devices_status ON public.network_devices(status);
CREATE INDEX IF NOT EXISTS idx_network_devices_auvik_id ON public.network_devices(auvik_device_id);
CREATE INDEX IF NOT EXISTS idx_network_connections_source ON public.network_device_connections(source_device_id);
CREATE INDEX IF NOT EXISTS idx_network_connections_target ON public.network_device_connections(target_device_id);

-- 5. updated_at triggers (function update_updated_at_column already exists from schema.sql)
DROP TRIGGER IF EXISTS update_offices_updated_at ON public.offices;
CREATE TRIGGER update_offices_updated_at BEFORE UPDATE ON public.offices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_network_devices_updated_at ON public.network_devices;
CREATE TRIGGER update_network_devices_updated_at BEFORE UPDATE ON public.network_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. RLS — read-only for authenticated users; service role (used by API) bypasses RLS
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_device_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.offices;
CREATE POLICY "Allow authenticated read access" ON public.offices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.network_devices;
CREATE POLICY "Allow authenticated read access" ON public.network_devices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.network_device_connections;
CREATE POLICY "Allow authenticated read access" ON public.network_device_connections FOR SELECT TO authenticated USING (true);

-- 7. Extend sync_logs.sync_type to allow 'auvik'
ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_sync_type_check;
ALTER TABLE public.sync_logs ADD CONSTRAINT sync_logs_sync_type_check
    CHECK (sync_type IN ('entra_id', 'ninjaone', 'intune', 'auvik', 'excel'));

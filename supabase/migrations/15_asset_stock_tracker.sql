-- Phase 28: accounting stock tracker (purchase lots + office allocations)
-- and Settings-managed Admin / Accounting login roles.

CREATE TABLE IF NOT EXISTS public.app_user_roles (
  email VARCHAR(255) PRIMARY KEY,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'accounting')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_app_user_roles_role ON public.app_user_roles(role);

ALTER TABLE public.app_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON public.app_user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on app_user_roles"
  ON public.app_user_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.app_user_roles (email, role, created_by)
VALUES
  ('cajohnson@bennett-pless.com', 'admin', 'seed'),
  ('plucas@bennett-pless.com', 'admin', 'seed'),
  ('dsimmons@bennett-pless.com', 'admin', 'seed'),
  ('kthom@bennett-pless.com', 'admin', 'seed')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.asset_purchase_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id VARCHAR(255) NOT NULL,
  purchase_date DATE NOT NULL,
  vendor VARCHAR(255),
  item_description TEXT,
  qty_purchased INTEGER NOT NULL CHECK (qty_purchased > 0),
  unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
  asset_type VARCHAR(50) NOT NULL CHECK (asset_type IN ('laptop', 'desktop')),
  manufacturer VARCHAR(100),
  model VARCHAR(255),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_purchase_lots_date
  ON public.asset_purchase_lots(purchase_date, created_at);

CREATE INDEX IF NOT EXISTS idx_asset_purchase_lots_asset_type
  ON public.asset_purchase_lots(asset_type);

ALTER TABLE public.asset_purchase_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON public.asset_purchase_lots
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on asset_purchase_lots"
  ON public.asset_purchase_lots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.asset_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id UUID REFERENCES public.asset_purchase_lots(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  assigned_date DATE NOT NULL,
  office VARCHAR(255) NOT NULL DEFAULT 'Unspecified',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(12, 2),
  allocated_cost NUMERIC(12, 2),
  source VARCHAR(20) NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_allocations_lot
  ON public.asset_allocations(lot_id);

CREATE INDEX IF NOT EXISTS idx_asset_allocations_date
  ON public.asset_allocations(assigned_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_allocations_device_once
  ON public.asset_allocations(device_id)
  WHERE device_id IS NOT NULL;

ALTER TABLE public.asset_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" ON public.asset_allocations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can do everything on asset_allocations"
  ON public.asset_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

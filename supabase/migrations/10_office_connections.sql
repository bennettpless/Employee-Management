-- Phase 18 migration: promote the inter-office topology from a browser-local
-- workbench to a real, DB-backed feature.
--
-- The site-to-site VPN / MPLS / Cloud Secure Edge links between offices used to
-- live only in each operator's browser localStorage (under the key
-- `temp-topology:inter-office:v1`). That was fine while the tool was a scratch
-- pad, but it meant links vanished on any browser change / cache wipe and were
-- invisible to every other user. This migration:
--
--   1. Adds `layout_x` / `layout_y` to `offices` so the inter-office canvas can
--      persist node positions the same way `network_devices.layout_x/_y` does
--      for per-office topologies.
--   2. Creates `office_connections` — one row per site-to-site link between two
--      offices, with the React Flow handle metadata (source/target handle,
--      curve offset) needed to render the diagram identically after reload.
--   3. Seeds both tables with the state we recovered from the operator's
--      browser on 2026-07-27 (see `scripts/inter-office-links-recovery.json`).
--      Seeding is idempotent: positions only fill NULL slots, and links only
--      insert when the table is completely empty.
--
-- Safe to re-run: every DDL uses IF NOT EXISTS, and both seed blocks are
-- guarded.

-- 1. Node positions on offices (mirrors network_devices.layout_x/_y)
ALTER TABLE public.offices
    ADD COLUMN IF NOT EXISTS layout_x DECIMAL,
    ADD COLUMN IF NOT EXISTS layout_y DECIMAL;

-- 2. Site-to-site connection table
CREATE TABLE IF NOT EXISTS public.office_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    target_office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
    -- Free-text label (e.g. "IPSec VPN", "Cloud Secure Edge", "MPLS",
    -- "Internet") — the map colours the line by keyword, so we don't lock this
    -- down to an enum.
    link_type VARCHAR(100) NOT NULL DEFAULT 'IPSec VPN',
    -- React Flow handle ids captured at draw time so edge routing survives
    -- reloads. Values are the short cardinal codes used by OfficeMapNode:
    -- 't', 'r', 'b', 'l'.
    source_handle VARCHAR(10),
    target_handle VARCHAR(10),
    -- Signed perpendicular distance of the arc's apex from the straight line
    -- between the two offices. NULL / 0 = straight line. Set by dragging the
    -- link's midpoint handle in the UI.
    curve_offset DECIMAL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT office_connections_no_self_loop CHECK (source_office_id <> target_office_id)
);

CREATE INDEX IF NOT EXISTS idx_office_connections_source ON public.office_connections(source_office_id);
CREATE INDEX IF NOT EXISTS idx_office_connections_target ON public.office_connections(target_office_id);

-- 3. updated_at trigger (function update_updated_at_column already exists)
DROP TRIGGER IF EXISTS update_office_connections_updated_at ON public.office_connections;
CREATE TRIGGER update_office_connections_updated_at BEFORE UPDATE ON public.office_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS: read-only for authenticated users; service role (used by the API)
-- bypasses RLS, matching the sibling `network_device_connections` policy.
ALTER TABLE public.office_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON public.office_connections;
CREATE POLICY "Allow authenticated read access" ON public.office_connections FOR SELECT TO authenticated USING (true);

-- 5. Seed office node positions (recovered from browser localStorage).
-- Only fills slots that are still NULL so we don't stomp on positions an
-- operator has already dragged into place post-migration.
UPDATE public.offices SET layout_x = 1151, layout_y = 544  WHERE id = '6f5947a9-5a91-4839-be96-48f8772ece2b' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 1724, layout_y = 531  WHERE id = '5ed8be5c-5cc4-484b-8747-9ec68621d962' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 1170, layout_y = 109  WHERE id = 'f928ec33-1401-4a8a-aa1f-da8ef165b958' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 504,  layout_y = 397  WHERE id = 'a20213cc-daf4-4271-8d97-996151c8a9d4' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 1647, layout_y = 177  WHERE id = '056ab012-625a-4f01-9601-16b6fbe496fe' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 1691, layout_y = 809  WHERE id = '645e3913-9f0a-4326-a9fe-918b93cf4834' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 508,  layout_y = 622  WHERE id = '2ef6b1d1-6dbe-4387-87c4-bda9eafa0aea' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 688,  layout_y = 159  WHERE id = '509b854e-48eb-45ad-8d1e-8e18cc05a7c2' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 887,  layout_y = 994  WHERE id = '71afc027-9929-4c84-bd1f-2071b0089cd4' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 1289, layout_y = 993  WHERE id = 'ed016174-f26e-49fe-8101-44ddda2f91b0' AND layout_x IS NULL AND layout_y IS NULL;
UPDATE public.offices SET layout_x = 601,  layout_y = 841  WHERE id = '4de9cfc5-9e22-4367-8493-a468db0920e0' AND layout_x IS NULL AND layout_y IS NULL;

-- 6. Seed inter-office links (recovered from browser localStorage).
-- Guard: only insert when the table is empty, so re-running the migration on a
-- deployment that has already accumulated operator edits doesn't duplicate the
-- historical dataset. The SELECT-from-VALUES form silently skips any row whose
-- source or target office was deleted after the recovery snapshot was taken.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.office_connections LIMIT 1) THEN
        INSERT INTO public.office_connections
            (source_office_id, target_office_id, link_type, source_handle, target_handle, curve_offset)
        SELECT v.src, v.tgt, v.lt, v.sh, v.th, v.co
        FROM (
            VALUES
                ('509b854e-48eb-45ad-8d1e-8e18cc05a7c2'::uuid, '5ed8be5c-5cc4-484b-8747-9ec68621d962'::uuid, 'IPSec VPN', 'r', 'l', NULL::decimal),
                ('056ab012-625a-4f01-9601-16b6fbe496fe'::uuid, '509b854e-48eb-45ad-8d1e-8e18cc05a7c2'::uuid, 'IPSec VPN', 't', 't', 166::decimal),
                ('056ab012-625a-4f01-9601-16b6fbe496fe'::uuid, 'f928ec33-1401-4a8a-aa1f-da8ef165b958'::uuid, 'IPSec VPN', 't', 't', 44::decimal),
                ('509b854e-48eb-45ad-8d1e-8e18cc05a7c2'::uuid, 'a20213cc-daf4-4271-8d97-996151c8a9d4'::uuid, 'IPSec VPN', 'l', 'l', 88::decimal),
                ('645e3913-9f0a-4326-a9fe-918b93cf4834'::uuid, '056ab012-625a-4f01-9601-16b6fbe496fe'::uuid, 'IPSec VPN', 'r', 'r', 205::decimal),
                ('645e3913-9f0a-4326-a9fe-918b93cf4834'::uuid, 'ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, 'IPSec VPN', 'b', 'b', -153::decimal),
                ('ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, '056ab012-625a-4f01-9601-16b6fbe496fe'::uuid, 'IPSec VPN', 't', 'b', NULL::decimal),
                ('f928ec33-1401-4a8a-aa1f-da8ef165b958'::uuid, '509b854e-48eb-45ad-8d1e-8e18cc05a7c2'::uuid, 'IPSec VPN', 't', 't', 46::decimal),
                ('f928ec33-1401-4a8a-aa1f-da8ef165b958'::uuid, '5ed8be5c-5cc4-484b-8747-9ec68621d962'::uuid, 'IPSec VPN', 'r', 't', -62::decimal),
                ('5ed8be5c-5cc4-484b-8747-9ec68621d962'::uuid, '056ab012-625a-4f01-9601-16b6fbe496fe'::uuid, 'IPSec VPN', 'r', 'r', 47::decimal),
                ('ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, '5ed8be5c-5cc4-484b-8747-9ec68621d962'::uuid, 'IPSec VPN', 'r', 'b', NULL::decimal),
                ('ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, '71afc027-9929-4c84-bd1f-2071b0089cd4'::uuid, 'IPSec VPN', 'b', 'b', -69::decimal),
                ('ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, 'f928ec33-1401-4a8a-aa1f-da8ef165b958'::uuid, 'IPSec VPN', 'l', 'l', -193::decimal),
                ('ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, '509b854e-48eb-45ad-8d1e-8e18cc05a7c2'::uuid, 'IPSec VPN', 'l', 'b', -140::decimal),
                ('a20213cc-daf4-4271-8d97-996151c8a9d4'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'r', 'l', NULL::decimal),
                ('2ef6b1d1-6dbe-4387-87c4-bda9eafa0aea'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'r', 'l', NULL::decimal),
                ('4de9cfc5-9e22-4367-8493-a468db0920e0'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'r', 'b', NULL::decimal),
                ('71afc027-9929-4c84-bd1f-2071b0089cd4'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 't', 'b', NULL::decimal),
                ('ed016174-f26e-49fe-8101-44ddda2f91b0'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 't', 'b', NULL::decimal),
                ('645e3913-9f0a-4326-a9fe-918b93cf4834'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 't', 'r', NULL::decimal),
                ('5ed8be5c-5cc4-484b-8747-9ec68621d962'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'l', 'r', NULL::decimal),
                ('056ab012-625a-4f01-9601-16b6fbe496fe'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'l', 't', NULL::decimal),
                ('f928ec33-1401-4a8a-aa1f-da8ef165b958'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'b', 't', NULL::decimal),
                ('509b854e-48eb-45ad-8d1e-8e18cc05a7c2'::uuid, '6f5947a9-5a91-4839-be96-48f8772ece2b'::uuid, 'IPSec VPN', 'b', 't', NULL::decimal)
        ) AS v(src, tgt, lt, sh, th, co)
        WHERE EXISTS (SELECT 1 FROM public.offices WHERE id = v.src)
          AND EXISTS (SELECT 1 FROM public.offices WHERE id = v.tgt);
    END IF;
END $$;

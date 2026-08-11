# Phase 17: Auvik Integration (Optional)

## Status: ❌ REMOVED IN PHASE 22

> **This phase shipped and was later removed.** Auvik was used once to seed the
> `network_devices` / `network_device_connections` tables across the 11 offices,
> then the operator elected to maintain the network inventory manually. All
> Auvik code, config, DB columns, and env vars were ripped out in
> [Phase 22](./22-auvik-removal.md). This document is preserved for historical
> context — do not act on it. Anything below that talks about Auvik being live
> is stale as of Phase 22.

## Overview

Wire Auvik as an optional, primary-when-configured data source for `network_devices` and `network_device_connections`. The sync respects manual overrides (`is_manually_overridden = true` rows are never written), runs daily via Vercel cron, and can be triggered manually from `/sync`. When the operator hasn't configured Auvik yet, the entire feature stays hidden and the manual entry / CSV import paths from Phase 14 continue to be the only source.

This phase also includes the **Auvik API setup guide** that the PRD references — what the operator needs to do in the Auvik admin portal to obtain API credentials.

## Prerequisites
- ✅ Phase 13-16 complete (schema, manual UI, geo map, topology)
- ✅ Existing pattern: NinjaOne sync at `app/api/sync/ninjaone/route.ts` and lazy-init client at `lib/ninjaone.ts` (this phase mirrors that pattern)

## Auvik API setup guide (operator action)

1. **Log in to Auvik** at `https://<your-tenant>.my.auvik.com` (the subdomain before `.my.auvik.com` is your `AUVIK_TENANT_DOMAIN`).
2. Go to **My Profile → API Keys** (top-right user menu → My Profile → API Keys tab). On some plans this is under **Discovery → Manage API Access**.
3. Click **Generate API Key**. Auvik will show:
   - The API user (your email or a service-account email)
   - The API key (a long token shown only once — copy it immediately)
4. **Recommended**: create a dedicated read-only API user via **Settings → Users → Add User** with role `Read-Only` and use that user's API key instead of a personal one. This makes it auditable and revocable.
5. Note the **tenant subdomain** — for `bennettpless.my.auvik.com` the value is `bennettpless`.
6. Add to your environment (Vercel project + local `.env.local`):
   ```
   AUVIK_API_USER=api-user@example.com
   AUVIK_API_KEY=...long-token...
   AUVIK_TENANT_DOMAIN=bennettpless
   ```
7. Restart the dev server (or redeploy) and trigger a manual sync from `/sync` to verify connectivity.

If your Auvik plan doesn't expose API key generation, contact Auvik support — the API is included on most paid tiers but may need to be enabled.

## Planned Changes

### Auvik HTTP client (`lib/auvik.ts`)
- [ ] Mirror the lazy-init pattern in `lib/ninjaone.ts`:
  ```ts
  let client: AuvikClient | null = null
  export function getAuvikClient(): AuvikClient | null {
    if (!process.env.AUVIK_API_USER || !process.env.AUVIK_API_KEY || !process.env.AUVIK_TENANT_DOMAIN) {
      return null
    }
    if (!client) {
      const baseUrl = `https://api.${process.env.AUVIK_TENANT_DOMAIN}.my.auvik.com/v1`
      const auth = Buffer.from(`${process.env.AUVIK_API_USER}:${process.env.AUVIK_API_KEY}`).toString('base64')
      client = new AuvikClient(baseUrl, auth)
    }
    return client
  }
  ```
- [ ] Implement these methods on `AuvikClient`:
  - `listNetworks()` — `GET /inventory/network/info` — paginated; each network ≈ one office in our model
  - `listDevices(networkId?)` — `GET /inventory/device/info?filter[networkId]=...`
  - `getDeviceDetail(deviceId)` — `GET /inventory/device/detail/{id}` — full device info with components
  - `listConnections(networkId?)` — `GET /inventory/entity/network/connection?filter[networkId]=...`
- [ ] Cursor-based pagination loop (Auvik returns `links.next` URLs)
- [ ] Rate-limit backoff: on `429`, sleep `Retry-After` seconds (default 30) then retry; cap at 3 retries

### Environment validation
- [ ] Extend `lib/env.ts` with `AUVIK_API_USER`, `AUVIK_API_KEY`, `AUVIK_TENANT_DOMAIN` as **optional** server vars (do NOT add to `requiredServerVars` — feature is optional)
- [ ] Add a helper `isAuvikConfigured(): boolean` that checks all three are set

### Sync route
- [ ] `app/api/network/sync/auvik/route.ts`:
  - Auth: `SYNC_CRON_SECRET` bearer (matching the NinjaOne pattern) OR an authenticated admin session
  - Returns 503 with a friendly error if Auvik isn't configured
  - Creates a `sync_logs` row with `sync_type = 'auvik'`, `status = 'success' | 'partial' | 'failed'`
  - Sync algorithm:
    1. List Auvik networks → for each, find matching `offices.auvik_network_id` (skip + log if no match)
    2. For each matching office, list Auvik devices in that network
    3. Upsert into `network_devices` keyed on `auvik_device_id`, **skipping rows where `is_manually_overridden = true`**
    4. Map Auvik `deviceType` → our `device_type` enum (see "Device-type mapping" below)
    5. Map Auvik device status → our `status` enum (see "Status mapping" below)
    6. List connections per network and upsert into `network_device_connections` keyed on `auvik_link_id`
  - Returns `{ networksProcessed, devicesUpserted, devicesSkipped, connectionsUpserted, errors }`

### Device-type mapping
Auvik returns granular `deviceType` strings. Map as follows (open question in `00-index.md` — adjust based on actual Auvik output):
```ts
const AUVIK_DEVICE_TYPE_MAP: Record<string, NetworkDeviceType> = {
  accessPoint: 'access_point',
  switch: 'switch',
  l3Switch: 'switch',
  firewall: 'firewall',
  router: 'router',
  server: 'server',
  hypervisor: 'server',
  // intentionally NOT mapped (filtered out): printer, voipPhone, workstation, unknown, ...
}
```
- [ ] Devices with no mapping are logged and skipped (not inserted as `'other'` to avoid noise from VoIP phones/printers)

### Status mapping
```ts
const AUVIK_STATUS_MAP: Record<string, NetworkDeviceStatus> = {
  up: 'online',
  down: 'offline',
  warning: 'warning',
  critical: 'critical',
  unknown: 'unknown',
}
```

### UI integration
- [ ] `app/sync/page.tsx`:
  - Add an "Auvik" sync card next to the existing NinjaOne card; only render if `isAuvikConfigured()`
  - Same pattern as NinjaOne: trigger button, last-run summary, polling for in-progress runs
- [ ] `app/settings/page.tsx`:
  - Add an Auvik connection-status card (configured/not configured); show last sync timestamp from `sync_logs`
- [ ] `app/network/page.tsx`:
  - Show an "Auvik sync" button (admin-only) if configured; ghost-disabled with tooltip if not

### Vercel cron
- [ ] Update `vercel.json` to add a daily 04:00 UTC entry:
  ```json
  {
    "crons": [
      { "path": "/api/sync/ninjaone", "schedule": "0 3 * * *" },
      { "path": "/api/network/sync/auvik", "schedule": "0 4 * * *" }
    ]
  }
  ```

### Documentation
- [ ] Update `SETUP_GUIDE.md` to include the Auvik API setup steps (or link to this doc)
- [ ] Update `README.md` env var section to list the three new optional vars

## Key Files

### New
- `lib/auvik.ts`
- `app/api/network/sync/auvik/route.ts`

### Edited
- `lib/env.ts` (optional Auvik vars + `isAuvikConfigured` helper)
- `app/sync/page.tsx` (Auvik sync card)
- `app/settings/page.tsx` (Auvik connection status)
- `app/network/page.tsx` (Auvik sync button)
- `vercel.json` (cron entry)
- `SETUP_GUIDE.md`, `README.md` (docs)

## Verification Checklist
- [ ] With env vars unset, `npm run build` passes and the Auvik sync card is hidden on `/sync`
- [ ] With env vars set, `/sync` shows the Auvik card and clicking "Sync now" runs the route
- [ ] Manual sync inserts `network_devices` rows with `source = 'auvik'` and the correct `device_type` mapping
- [ ] Devices flagged `is_manually_overridden = true` are NOT updated by the sync (verify by setting the flag, running sync, confirming `last_synced_at` did not change for that row)
- [ ] Connections appear in `network_device_connections` and render as edges in the topology diagram
- [ ] An Auvik network with no matching `offices.auvik_network_id` logs a warning in the `sync_logs.error_message` column but doesn't fail the whole sync
- [ ] The cron entry in `vercel.json` validates against Vercel's cron schema
- [ ] Rate-limit backoff: simulate a `429` response and verify the client waits + retries

## Implementation Notes

Implemented per spec. Key decisions and deviations from the plan:

- **`lib/auvik.ts`** mirrors the lazy-init pattern of `lib/ninjaone.ts`. The class uses HTTP Basic auth (base64 of `AUVIK_API_USER:AUVIK_API_KEY`), JSON:API cursor pagination via `links.next`, and a `429`-aware retry helper that respects `Retry-After` (default 30s) up to 3 attempts. The four required methods are implemented: `listNetworks()`, `listDevices(networkId?)`, `getDeviceDetail(id)`, and `listConnections(networkId?)`.
- **`AUVIK_API_BASE_URL` escape hatch** — the spec hard-codes the base URL as `https://api.{tenant}.my.auvik.com/v1`, but Auvik's public API actually uses a region-host pattern in some configurations (e.g. `https://auvikapi.us1.my.auvik.com/v1`). To avoid breaking on tenants where the spec's URL doesn't resolve, the client accepts an optional `AUVIK_API_BASE_URL` env var that overrides the computed URL. Operators discovering URL issues can set this without a code change. Added to `.env.example` and `lib/env.ts`'s optional vars list.
- **Status endpoint added (`GET /api/network/sync/auvik`)** — beyond the spec'd `POST` route, the same path also serves a lightweight `GET` that returns `{ configured, lastSync }`. The Sync, Settings, and Network pages all hit this endpoint at mount to decide whether to render Auvik UI. Without it, the client would have no way to ask "is Auvik configured?" without exposing the env var directly.
- **Sync algorithm** matches the spec: list networks → match each to `offices.auvik_network_id` (skip + log if no match) → list devices per matched network → upsert into `network_devices` keyed on `auvik_device_id`, **honoring `is_manually_overridden = true` by skipping** → list connections per network and upsert into `network_device_connections` keyed on `auvik_link_id`. The route returns `{ networksProcessed, networksSkipped, devicesUpserted, devicesSkipped, devicesFailed, connectionsUpserted, connectionsSkipped, connectionsFailed, errors, duration }`.
- **Connection conflict handling** — the schema enforces a `UNIQUE(source_device_id, target_device_id, source_port, target_port)`. If a manual edge already covers the same physical link, a fresh insert hits `23505`; the route catches this and falls back to `UPDATE … WHERE` matching the four columns to attach the `auvik_link_id` to the existing row instead of failing the whole sync.
- **Manual-override pre-check** — to honour `is_manually_overridden` without an extra round trip per device, the route batch-loads existing rows by `auvik_device_id` once per network and consults the in-memory map.
- **Auth strategy** matches NinjaOne's: `Bearer ${SYNC_CRON_SECRET}` from cron OR an authenticated admin session. Returns `503` if Auvik isn't configured, `401` if neither auth path passes.
- **UI gating** — the Auvik card on `/sync`, the Auvik status card on `/settings`, and the "Sync Auvik" button on `/network` all probe `GET /api/network/sync/auvik` at mount and conditionally render based on `data.configured`. With env vars unset, no Auvik UI is visible anywhere; with vars set, all three surfaces light up. The `/network` button additionally checks `isAdmin` so non-admins can't trigger a sync from the dashboard.
- **`vercel.json` restored** — the file was deleted during the Phase 20 deployment-direction discussion. This phase needed it for the cron registration spec'd here, so it's been recreated with both the existing NinjaOne 03:00 UTC cron and the new Auvik 04:00 UTC cron. If Phase 20 ultimately picks a non-Vercel deployment, this file can be deleted again — neither cron path is _required_ to live in `vercel.json` specifically (both can be driven by Windows Task Scheduler on the self-hosted desktop, as the existing `scripts/cron/install-task.ps1` does).
- **Device-type mapping** uses the table from the spec verbatim. The map covers `accessPoint` / `switch` / `l3Switch` / `firewall` / `router` / `server` / `hypervisor`. Unmapped Auvik device types (printers, VoIP phones, workstations, etc.) are intentionally **skipped** rather than coerced to `'other'`, with a per-device warning recorded in `sync_logs.error_message`. **TODO during real-world testing**: capture the actual `deviceType` strings returned by the Bennett & Pless tenant and refine `AUVIK_DEVICE_TYPE_MAP` in `lib/auvik.ts` if needed (the open question in `00-index.md` tracks this).
- **Status mapping** also matches the spec, with `up`/`online` both → `'online'` and `down`/`offline` both → `'offline'` (Auvik docs show `up`/`down` while some endpoints show `online`/`offline`; both are safe to map identically).
- **Sync log type extended** — `lib/types.ts` `SyncLog.sync_type` already had room for `'auvik'` because the DB constraint was extended in the Phase 13 migration; added the literal to the TS union for type safety.
- **Build verification** — `npm run build` passes cleanly. The pre-existing `DYNAMIC_SERVER_USAGE` warnings on `/api/network/topology`, `/api/devices`, `/api/employees`, and `/api/devices/available` are unchanged by this phase.

### Operator setup checklist after merge

1. Add `AUVIK_API_USER`, `AUVIK_API_KEY`, `AUVIK_TENANT_DOMAIN` to `.env.local` (and to whichever production env Phase 20 chooses).
2. Generate the API key in Auvik via **My Profile → API Keys** (recommend a dedicated read-only service-account user — see SETUP_GUIDE.md §"Auvik Setup").
3. Edit each office under **Settings → Office Management** and paste in the office's Auvik network ID.
4. Trigger a manual sync from `/sync` to verify connectivity. Inspect `sync_logs.error_message` for any "no matching office" warnings or unmapped-device-type warnings.
5. If the operator's Auvik tenant uses the region-host API pattern instead of the default, set `AUVIK_API_BASE_URL` to the full base URL (e.g. `https://auvikapi.us1.my.auvik.com/v1`).

# Phase 17: Auvik Integration (Optional)

## Status: ⬜ Pending

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
_Added during/after implementation. Document the actual Auvik device-type values returned by your tenant so the mapping table can be refined._

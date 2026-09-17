# Phase 26: Ninja Ticket → Device Repair History

## Status: ⬜ Pending (parked — do not start until higher-priority work is done)

## Overview

When a NinjaOne ticket is filed against a device for a hardware-class issue (BSOD, replacement, failed disk, etc.), automatically add or update a row in that device’s **Repair / Upgrade History**. The goal is a durable issue log for later decommissioning and repurposing — not a live ticketing UI.

Pull tickets **directly from NinjaOne**. The IT Response Agent was removed from this app in [Phase 27](./27-response-agent-removal.md); this phase does not depend on it.

## Motivation

Repair history today is manual on `/devices/[id]` (`device_history`: `repair` | `upgrade` | `note`). Setting `devices.status` to `repair` does not create a history row. Ninja already identifies devices via `ninja_device_id`; tickets already carry `nodeId` (the Ninja device id). That join is unused.

## Scope decisions

| Topic | Decision |
|-------|----------|
| Ticket source | NinjaOne Public API (IT Response Agent removed in Phase 27) |
| Which tickets | Keyword match on subject + description (hardware-class issues only) |
| Device match | Ticket must have `nodeId`; match `devices.ninja_device_id` |
| Device status | **Do not** auto-set `devices.status` to `repair` — history is a lifetime log; status means “currently in repair” |
| Trigger | Manual button on `/devices` + hourly GitHub Action cron |
| Dedup | Upsert on `(source, external_id)` so re-syncs update closed tickets instead of duplicating |
| Unused `tickets` table | Leave it; do not revive Phase 10 ticketing |

## Data model

New migration (e.g. `15_device_history_ninja_ticket.sql` — number may shift if other migrations land first):

- `device_history.source` — `'manual'` \| `'ninjaone'` (default `'manual'`)
- `device_history.external_id` — Ninja ticket id (nullable for manual rows)
- Unique index on `(source, external_id)` where `external_id IS NOT NULL`
- Optional `ticket_status` for the UI
- `sync_logs.sync_type` CHECK extended with `'ninja_tickets'`

## Match + filter

1. Skip tickets with no `nodeId`.
2. Skip tickets whose `nodeId` does not match an EMS device (`ninja_device_id`). Count in the sync log; do not fail the run.
3. Keyword match (case-insensitive) on subject + description. Starter list in one constant:

   `bsod`, `blue screen`, `hardware`, `replacement`, `replaced`, `ram`, `memory`, `ssd`, `hdd`, `disk`, `motherboard`, `battery`, `keyboard`, `screen`, `display`, `fan`, `overheat`, `thermal`, `dock`, `charger`, `power supply`, `gpu`, `cpu`, `crash dump`, `failed drive`

4. Event type: `upgrade` if keywords like `upgrade` / `ram` / `ssd` / `memory` hit; otherwise `repair`.

Description format (stable for upserts):

`Ninja #12345 — [Open|Resolved] — {ticket subject}`

## Ninja API

Existing client [`lib/ninjaone.ts`](../../lib/ninjaone.ts) only has `GET /v2/devices` and `GET /v2/device/{id}` (`scope: monitoring management`). Extend with:

- `GET /v2/ticketing/trigger/boards`
- `POST /v2/ticketing/trigger/board/{boardId}/run` (paginated list)
- `GET /v2/ticketing/ticket/{ticketId}`

Ninja has no “list all tickets” endpoint. Listing is always via a **board**. Optional env `NINJA_TICKET_BOARD_ID`; if unset, pick a named board (e.g. “All Tickets”). The board **must include closed tickets** so the first run can backfill history, not only open work.

If ticketing calls return 403, enable ticketing on the Ninja API application (token scope may stay `monitoring management`).

New helper: `lib/ninja-tickets.ts` (keyword + match + upsert).

## Sync job

**`POST /api/sync/ninja-tickets`**

- Auth: logged-in admin **or** `Authorization: Bearer {SYNC_CRON_SECRET}`
- Exclude this path in `middleware.ts` (same pattern as the retired `/api/sync/ninjaone` cron bypass)
- Write a `sync_logs` row
- Return `{ matched, inserted, updated, skippedNoDevice, skippedKeywords, unmatched }`

Do **not** fold this into onboarding sync.

Triggers:

- Manual button on `/devices`
- Hourly GitHub Action hitting `https://app-ems-bp-prod.azurewebsites.net/api/sync/ninja-tickets` with `SYNC_CRON_SECRET` (Azure is public)

First run is a full board backfill; later runs are the same upsert.

## UI

On `/devices/[id]` Repair / Upgrade History:

- **Ninja** badge + ticket id when `source === 'ninjaone'`
- Optional “Open in Ninja” link: `{ninjaBase}/#/ticketing/ticket/{external_id}`
- Keep manual add/delete; deleting a synced row is allowed (false-positive cleanup) and audited as today

## Out of scope

- IT Response Agent / iframe tickets
- Auto-changing `devices.status`
- Tickets with no `nodeId` (hostname-in-subject matching)
- Ninja webhooks (can add later if near-real-time is needed)
- Logging every device ticket (password resets, printers, etc.)

## Prerequisites (confirm in Ninja before coding)

- [ ] EMS API client can call ticketing endpoints
- [ ] A board exists that includes historical/closed tickets (or an explicit board id)
- [ ] Hardware-issue tickets are actually **linked to a device** in Ninja (`nodeId` set). User-only tickets will never land on a device here.

## Planned Changes

- [ ] Migration: `device_history.source` / `external_id` + unique index; `sync_logs` type `ninja_tickets`
- [ ] Types: extend `DeviceHistoryEntry` and `SyncLog.sync_type` in `lib/types.ts`
- [ ] `lib/ninjaone.ts` — boards + paginated ticket list + getTicket
- [ ] `lib/ninja-tickets.ts` — keyword filter, device match, upsert helpers + Vitest
- [ ] `POST /api/sync/ninja-tickets` — admin + cron-secret auth
- [ ] Middleware exclusion + revive `SYNC_CRON_SECRET` for this path
- [ ] Device detail: Ninja badge + ticket link
- [ ] Devices page: Sync tickets button
- [ ] GitHub Action hourly cron + Azure App Setting for `SYNC_CRON_SECRET`

## Key Files (expected)

- `supabase/migrations/15_device_history_ninja_ticket.sql` (name may shift)
- `lib/ninjaone.ts`, `lib/ninja-tickets.ts`, `lib/types.ts`
- `app/api/sync/ninja-tickets/route.ts`
- `middleware.ts`
- `app/devices/[id]/page.tsx`, `app/devices/page.tsx`
- `.github/workflows/` (new cron workflow or job)
- `tests/lib/ninja-tickets.test.ts`

## Verification Checklist (when implemented)

- [ ] Keyword-matching ticket with `nodeId` upserts a history row on the matching device
- [ ] Same ticket on a second sync updates status, does not duplicate
- [ ] Password-reset / no-keyword tickets are skipped
- [ ] Tickets with no `nodeId` or unmatched Ninja id are skipped and counted
- [ ] Manual history add/delete still works
- [ ] Device status is unchanged by the sync
- [ ] Manual button and cron secret both can trigger the job

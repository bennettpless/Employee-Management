# Phase 24: Sync Review Modal + New Ninja Devices

## Status: ✅ Complete

## Overview

Extend **Sync Onboarding/Offboarding** on `/devices` so a single run:

1. Continues to onboard / offboard employees from SharePoint and assign or create their Ninja machines.
2. Also **inserts new unassigned NinjaOne devices** that are not already in inventory (servers, shared gear, etc.).
3. Returns a structured `review.items` payload and opens a **Sync review** modal so an admin can set asset type, status, department, and location for every device that changed in that run.

## Motivation

Previously the sync only returned name lists + aggregate counters, and the Devices page showed a green banner. New hardware that never matches an employee name (e.g. servers) never entered inventory unless someone re-enabled the retired full Ninja sync. Operators also had no guided place to classify devices right after they appeared.

## Scope decisions

| Topic | Decision |
|-------|----------|
| Ninja scope | **Insert-only** for devices whose `ninja_device_id` (and name/serial fallback) is not already in `devices`. Never overwrite existing rows. |
| Review edits | Per device: `asset_type`, `status`, `department`, `location` only. |
| Trigger | Same **Sync Onboarding/Offboarding** button on `/devices`. |
| Old Ninja cron route | `/api/sync/ninjaone` stays **410 retired**. New pull lives only inside onboarding sync. |

## Backend (`POST /api/sync/onboarding`)

While syncing, accumulate `SyncReviewItem[]` (kinds: `device_created`, `device_assigned`, `device_returned`, `ninja_new`, `employee_onboarded`, `employee_offboarded`).

### Match keys (two paths)

| Path | Match key |
|------|-----------|
| Onboarding Excel machine cells (New **or** Existing) → inventory, then Ninja | **`device_name`** / Ninja `systemName`/`dnsName` (compact name match); missing → `pending_device_lookups` retry. Only **new** hires are read from the sheet (older columns skipped); no deep history re-assign. |
| New unassigned Ninja inventory pull | **`serial_number`** (+ already-linked `ninja_device_id`); name is not used |

After sheet logic, a **new-Ninja pass**:

1. Load Ninja devices (reuse list if already fetched for machine lookups).
2. **Match key = `serial_number`** (normalized, ≥4 chars), plus already-linked `ninja_device_id`. Device name is **not** used to decide match/skip.
3. **Serial match:** link `ninja_device_id` / `is_in_ninja` onto the existing row only (no inventory field overwrite) so the device stops counting as “new” on later runs.
4. Insert true unknowns (no ninja id + no serial match) with `employee_id: null`, `status: 'in_stock'`, `is_in_ninja: true`, best-effort `asset_type` (else `'other'`).
5. Cap at **100 successful inserts** per run (not “first 100 list rows”); also cap detail fetches (~300) so large orgs can continue on a later sync. Warnings reflect remaining candidates after examine/link/insert.
6. Increment `stats.ninjaNew` and push `ninja_new` review items.

Response shape (existing fields retained):

```json
{
  "success": true,
  "stats": { "onboarded": 0, "ninjaNew": 0, "...": "..." },
  "review": { "items": [ /* SyncReviewItem[] */ ] },
  "errors": [],
  "duration": 12
}
```

Shared types live in `lib/sync-review.ts`.

## Frontend

### `components/devices/SyncReviewModal.tsx`

- Opens when `review.items.length > 0`.
- Sections: Employees (read-only), Devices (editable dropdowns).
- Device options from `ASSET_TYPES`, `DEVICE_STATUSES`, `DEPARTMENTS`, and locations loaded on the Devices page.
- **Save changes** batches `PATCH /api/devices/[id]` for dirty rows, then closes and refreshes.
- **Skip / Done** closes without saving remaining edits.
- Sync warnings appear in a collapsible block inside the modal.

### `/devices` wiring

- `handleOnboardingSync` opens the modal on a non-empty review.
- Compact green banner remains only when the sync succeeds with **no** review items (e.g. nothing changed, or warnings-only).

## Out of scope

- Re-enabling cron `/api/sync/ninjaone`
- Editing assignment / notes from this modal
- Retroactively updating devices already in inventory on every sync

## Files

| Path | Change |
|------|--------|
| `app/api/sync/onboarding/route.ts` | Review accumulation + new-Ninja insert pass |
| `lib/sync-review.ts` | Shared review / sync result types |
| `components/devices/SyncReviewModal.tsx` | Post-sync review UI |
| `app/devices/page.tsx` | Open modal + refresh after save/dismiss |

# Phase 25: Loaner flag, Ninja helpers, Network lock

## Status: Complete

## Overview

Three operator-requested changes shipped together:

1. **Loaner** is a checkbox (`devices.is_loaner`), not a fifth exclusive status, so a device can appear under both Loaner and Active / In Stock.
2. **Ninja coverage** stays on **Sync Onboarding/Offboarding** — unmatched Ninja devices are still auto-inserted (cap 100/run, serial / `ninja_device_id` match, no overwrite). Shared match helpers live in `lib/ninja-inventory.ts`.
3. **Network inventory** stays in this app but is visible and callable only for `dsimmons@bennett-pless.com`. Other admins keep Office Management.

## Loaner

- Migration: [`supabase/migrations/13_device_is_loaner.sql`](../../supabase/migrations/13_device_is_loaner.sql)
- Status dropdown is still Active / In Stock / Repair / Decommissioned
- Filter chip **Loaner** queries `is_loaner = true`
- Assign still flips `in_stock` → `active`; unassign still flips back to `in_stock`; neither clears the flag
- SharePoint import maps sheet status `loaner`/`spare` and assigned-user `loaner`/`spare` onto `is_loaner`

**Production:** apply the migration on Supabase after deploy.

## Ninja

Onboarding sync is unchanged in behavior from Phase 24: link existing rows by serial / Ninja id, then insert unmatched devices as unassigned `in_stock` (cap 100). The post-sync review modal still lets you set type / status / department / location on those new rows.

## Network lock

- Allow-list: [`lib/network-access.ts`](../../lib/network-access.ts)
- Hidden from nav and home for everyone else; Settings → Admin Tools card for Destiny only
- Middleware + `/network` layout + inventory APIs (`/api/network/devices*`, topology, export, import, inter-office)
- **Not locked:** `GET /api/network/offices` (employee/device location dropdowns), office writes (`isAdminRequest`), geocode (Office Management)

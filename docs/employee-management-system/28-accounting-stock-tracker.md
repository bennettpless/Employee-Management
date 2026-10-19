# Phase 28: Accounting stock tracker

## Status: Complete

## Overview

Accounting tracks **purchase lots** (qty, unit cost, total purchase cost including tax, remaining stock value) and a **month-end office allocation** report. This is a financial ledger, not a second copy of per-serial Devices. Enter Admin stock purchases by hand (typically $200+); the app does not reject cheaper unit costs. **Total purchase cost** is typed in, tax included. Remaining stock value and each office charge are an equal share of that total.

Lot types: laptop, desktop, server, SSD, RAM, monitor, other. TVs and printers are device-only and are not stock lots.

- **Stock Tracker** (`/stock`) — add/edit purchases. Lots with remaining qty always show. A lot that hits 0 stays through the Eastern month it emptied, then leaves this page. Allocations stay on Reports.
- **Devices add** and **assigning a stock-type device** — lot dropdown (invoice #, **purchase date**, make/model, qty left, unit cost) with FIFO default, or **Not from stock**, plus a required **Charge to** office (offices minus Remote) **when the device is assigned to a person**. Unassigned devices (Add Device with no assignee, and **ninja_new** Ninja inventory) pick an existing lot only: that stores `devices.stock_lot_id` and does **not** insert an allocation or reduce qty. Charge to and qty happen on first assign. **ninja_new** can also check Not from stock for anomalies (for example a device that left Ninja and came back) so it is not tagged to a lot. That lot choice is stored on the device (`stock_lot_id` / `not_from_stock`) so later assigns do not ask again; the Devices modal still shows lot controls if it later needs a purchase. **Finish later** (or the X) saves unfinished review cards in the browser; the next sync (or Resume on `/devices`) brings them back.
- **Charge existing device** (`/stock`) — for PCs that were assigned before their purchase lot was entered. Lists assigned, non-loaner stock-type devices with no allocation (`GET /api/stock/chargeable-devices`), then picks a lot, Charge to office, and an **Assigned date** (defaults to the current assignment date). The charge lands on **this month's** report (`recorded_date`) but shows the original **Date assigned**, flagged **Recorded late** on Reports. Posts to `POST /api/stock/allocations`, which now returns 409 if the device already has an allocation (unmatched ones are fixed from **Unmatched assignments** instead). Clears Not from stock if it was set.
- **Employees** — assign only devices already in inventory. Re-assigning a returned device does not charge again.
- **Reports** (`/stock/reports`) — month, month-to-month, or yearly office allocations, with CSV. **Email this period** sends the on-screen range (CSV attached) to `STOCK_REPORT_EMAIL_TO` (defaults to Destiny while testing). A GitHub Action on the 1st of each month emails the month that just closed.
- **Access** (Settings) — Admin vs Accounting email lists. Accounting sees only Stock + Reports.

## Schema

Apply [`supabase/migrations/15_asset_stock_tracker.sql`](../../supabase/migrations/15_asset_stock_tracker.sql), [`supabase/migrations/16_device_not_from_stock.sql`](../../supabase/migrations/16_device_not_from_stock.sql), [`supabase/migrations/17_device_stock_lot_id.sql`](../../supabase/migrations/17_device_stock_lot_id.sql), [`supabase/migrations/18_stock_lot_asset_types.sql`](../../supabase/migrations/18_stock_lot_asset_types.sql), [`supabase/migrations/20_allocation_recorded_date.sql`](../../supabase/migrations/20_allocation_recorded_date.sql), [`supabase/migrations/21_stock_lot_cpa_number.sql`](../../supabase/migrations/21_stock_lot_cpa_number.sql), and [`supabase/migrations/22_stock_lot_total_purchase_cost.sql`](../../supabase/migrations/22_stock_lot_total_purchase_cost.sql) on production after deploy.

- `app_user_roles` — seeded with the four IT admins
- `asset_purchase_lots` — optional `cpa_number` (CPA #), and `total_purchase_cost` (entered, tax included). Existing lots are backfilled as qty × unit cost.
- `asset_allocations` (unique on `device_id` so a unit is consumed at most once)
- `devices.not_from_stock` — skip charging on later assigns; lot UI remains on the device modal
- `devices.stock_lot_id` — which purchase lot an unassigned unit came from, without consuming qty until first assign

## Automation

`maybeConsumeStockLot` runs after:

- `POST /api/devices` when a stock-type device is created from a chosen lot (`force`; tags the lot if unassigned, consumes when there is an assignee)
- `POST /api/employees/[id]/devices` (existing `device_id` only)
- `PATCH /api/devices/[id]` when assignee changes, or when an unassigned device is tagged with a lot
- onboarding sync when an inventory device is assigned or a Ninja device is created already assigned

FIFO picks the oldest matching open lot (same type and make/model). The dropdown lists matching open lots (invoice #, purchase date, make/model, qty left, unit cost) so the admin can override. Depleted lots are not deleted (reports still join them); they only drop off `/stock` after the month they emptied.

Lots require manufacturer and model. Same item on the same date at different unit costs are **separate lots** (so each office is charged the right price). Same model bought later is also a new lot.

Skipped for loaners, person-to-person transfers, TVs/printers, Not from stock, and any device that already has an allocation. Unassigning does **not** restore quantity. RAM/SSD lots sit on `/stock` until a matching device is tagged or assigned (they are usually not Ninja hosts).

## Reports

The monthly report groups by **assigned date + Charge to office + lot**. Two units from the same lot on the same day and office combine quantity. The last unit of one lot and the first of another stay **two rows**, even if they are the same make/model. **CPA #** (stored as `cpa_number` on the lot) is the first column. **Invoice #** (stored as `item_id`), **Make / Model**, and **Lot purchased** (the lot’s purchase date) follow it on the table, CSV, and email attachment so accounting can see why two like items appear on the same assignment date.

Office on the allocation is the **Charge to** office picked next to the lot (Settings offices minus Remote; Orlando/Sarasota = Florida). It is never copied from the employee’s location. `assigned_date` is the Eastern calendar date the PC was handed out and is what the report shows. `recorded_date` is the Eastern date the charge was entered in the tracker and decides which month's report it is on, so nothing lands in a month that was already emailed. They match for normal assigns. Attaching a lot to an Unmatched assignment also moves it to the current month, since it showed $0 before.

## Month-end email

GitHub Action [`.github/workflows/stock-report-email.yml`](../../.github/workflows/stock-report-email.yml) POSTs `/api/cron/stock-report` at `0 12 1 * *` (1st of the month, 12:00 UTC). That sends the **previous** Eastern calendar month to `STOCK_REPORT_EMAIL_TO` (default `dsimmons@bennett-pless.com`) via Graph `Mail.Send`, with the CSV attached.

Needs Azure AD **Mail.Send** (application) on the EMS app registration, admin consent, `STOCK_REPORT_EMAIL_FROM` as a real mailbox the app can send as, and `SYNC_CRON_SECRET` in both Azure App Settings and GitHub Actions secrets.

## Out of scope

- Reversing allocations when a device returns to stock
- TVs and printers (device inventory only; not stock lots)
- Spreadsheet inventory import (does not consume lots)

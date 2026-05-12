# Phase 3: API Routes

## Status: ✅ Complete

## Overview
Build Next.js API Route Handlers for employees, devices, software, licenses, sync operations, and Excel write-back.

## Prerequisites
- ✅ Phase 1 complete: Database tables and schema
- ✅ Phase 2 complete: Integration libraries

## Planned Changes
- [x] `GET /api/employees` — list with filters (status, department, office, search)
- [x] `GET /api/employees/[id]` — detail with devices, licenses, previous devices
- [x] `PUT /api/employees/[id]` — update employee, sync to Excel
- [x] `POST /api/employees/onboard` — create employee + write to Excel
- [x] `POST /api/employees/[id]/offboard` — unassign devices, delete Excel row, remove from DB
- [x] `POST /api/employees/[id]/devices` — assign device, update history, update Excel
- [x] `DELETE /api/employees/[id]/devices/[deviceId]` — remove assignment, update history, update Excel
- [x] `GET /api/devices` — list with deduplication and filter support
- [x] `GET /api/devices/[id]` — detail with software, current/previous users
- [x] `GET /api/software` — paginated software inventory
- [x] `GET /api/licenses` — license usage aggregation
- [x] `POST /api/sync/excel` — SharePoint Excel sync (long-running)
- [x] `POST /api/sync/ninjaone` — NinjaOne sync with device matching
- [x] `GET /api/sync/logs` — sync history
- [x] `GET /api/sync/status/[id]` — poll sync status
- [x] `POST/PUT/DELETE /api/excel/employees` — direct Excel row operations
- [ ] Add input validation with Zod schemas on write endpoints

## Key Files
- `app/api/employees/route.ts`
- `app/api/employees/[id]/route.ts`
- `app/api/employees/onboard/route.ts`
- `app/api/employees/[id]/offboard/route.ts`
- `app/api/employees/[id]/devices/route.ts`
- `app/api/employees/[id]/devices/[deviceId]/route.ts`
- `app/api/devices/route.ts`
- `app/api/devices/[id]/route.ts`
- `app/api/software/route.ts`
- `app/api/licenses/route.ts`
- `app/api/sync/excel/route.ts`
- `app/api/sync/ninjaone/route.ts`
- `app/api/sync/logs/route.ts`
- `app/api/sync/status/[id]/route.ts`
- `app/api/excel/employees/route.ts`

## Known Issues (from code review)

### Critical
- **Sync auth bypass**: Auth only checked if `Authorization` header is present — omitting header allows unauthenticated sync
- **Search injection**: User search input is interpolated directly into `.or()` PostgREST filter — special chars can alter query

### Performance
- **N+1 device counts**: Employee list fires one device query per employee — replace with single batch query
- **N+1 software queries**: Employee detail fires one software query per device — batch with `.in()`
- **Software route**: Loads entire dataset then paginates in memory — pagination doesn't reduce DB load
- **Device dedup**: All devices loaded into memory for serial dedup — use SQL `DISTINCT ON`

### Bugs
- **Excel sync crash**: `devices.map()` called on potentially `undefined` — needs `(devices ?? []).map()`
- **Offboard email match**: Uses `.includes()` for email — partial matches can delete wrong Excel row
- **Onboard ID generation**: `Date.now().slice(-4)` is weak, can collide — use DB sequence or UUID
- **Unchecked errors**: Several Supabase `update`/`insert` calls don't check the error return

### Code Quality
- Excessive `console.log` statements with PII in production
- Heavy `any` typing — should use `lib/types.ts` interfaces
- Manual `updated_at` set despite DB trigger already handling it
- Fragile replication lag retry/sleep logic in employee GET

## Remaining Work
- Add Zod validation on all write endpoints (onboard, update, device assign)
- Fix sync auth bypass (always require secret)
- Fix N+1 queries with batch approach
- Sanitize search input
- Guard `devices ?? []` in Excel sync

## Verification Checklist
- [x] All CRUD operations work
- [x] Sync from Excel populates employees and devices
- [x] NinjaOne sync enriches device details
- [x] Excel write-back works on update/onboard/offboard
- [x] Sync logs are recorded
- [ ] Input validation with Zod on write endpoints
- [ ] N+1 queries resolved
- [ ] Search input sanitized

## Implementation Notes
- Sync routes use `maxDuration: 600` for Vercel serverless timeout
- Cron secret is optional (checked only if header present) — needs hardening
- Employee PUT has a verification re-fetch pattern to work around perceived replication lag
- `ninjaone` sync route is ~966 lines — should be broken into smaller functions

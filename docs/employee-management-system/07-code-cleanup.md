# Phase 7: Code Cleanup & Hygiene

## Status: ✅ Complete

## Overview
Remove dead code, unused dependencies, debug logging, and address code quality issues found in the code review.

## Prerequisites
- ✅ Phase 1–4 complete

## Planned Changes

### Security Fixes
- [x] Fix sync route auth bypass — always require `SYNC_CRON_SECRET` (not just when header is present)
- [x] Sanitize search input in employee list API — strip PostgREST special characters in `.or()` filter
- [x] Sanitize search input in device available API — same treatment

### Performance Fixes
- [x] Replace N+1 device count queries in `GET /api/employees` with single batch query
- [x] Replace N+1 software queries in `GET /api/employees/[id]` with batch `.in()` query
- [ ] Fix software route to paginate at DB level, not in memory — **Deferred**: grouping/dedup logic requires all records in memory; current approach is intentional
- [ ] Fix device list dedup — use SQL `DISTINCT ON` instead of loading all into memory — **Deferred**: dedup logic is multi-field and cross-record; SQL DISTINCT ON insufficient

### Bug Fixes
- [x] Guard `devices ?? []` in Excel sync route to prevent crash on undefined — already guarded with `?.length`
- [x] Fix offboard — uses exact `.eq('id', params.id)` match (was already correct)
- [x] Fix onboard ID generation — DB-generated UUID already used (no `Date.now().slice(-4)` in current code)
- [x] Check error returns on Supabase `update`/`insert` calls in device assignment routes — verified, errors are checked
- [x] Remove manual `updated_at` set in employee PUT (DB trigger handles it)
- [x] Remove replication lag retry/sleep logic from employee GET

### Dependency Cleanup
- [x] Remove unused `zustand` from `package.json`
- [x] Remove unused `@supabase/auth-helpers-nextjs` from `package.json`
- [x] Remove unused `exceljs` from `package.json`

### Dead Code Removal
- [x] Remove unused `supabase` anon export from `lib/supabase.ts`
- [x] Remove unused `getExcelWorkbook` from `lib/sharepoint-excel.ts`
- [x] Remove unused `getUserManager`, `getUserPhoto`, `getUserDevices`, `getAllUsersWithDevices`, `getAllUsers` from `lib/azure-graph.ts`
- [x] Remove unused `getTickets`, `getOrganizations`, `getDeviceCustomFields` from `lib/ninjaone.ts`
- [x] Remove unused `NinjaTicket` interface from `lib/ninjaone.ts`
- [x] Remove `ninjaError` dead variable in `sync/logs/route.ts`

### Logging Cleanup
- [x] Remove all debug `console.log` statements from API routes
- [x] Remove `console.log` from `EmployeeCard` component — none found
- [x] Remove PII logging (emails, phone numbers, department) from employee routes
- [x] Remove debug logging from page components (`employees/page.tsx`, `software/page.tsx`)

### Code Quality
- [x] Remove manual `updated_at` set in employee PUT (trigger handles it)
- [x] Remove replication lag retry/sleep logic from employee GET
- [x] Cache `getServiceSupabase()` as singleton
- [x] Extract duplicated `getColumnLetter()` into shared utility (top of `sharepoint-excel.ts`)
- [x] Add lazy init to `NinjaOneClient` constructor (avoid crash on missing env vars)
- [x] Remove verification re-fetch in employee PUT
- [ ] Replace `any` types with proper interfaces from `lib/types.ts` — **Deferred**: pervasive `any` usage across the codebase; would be a separate large refactor
- [ ] Remove unused `departments`/`offices` state from `EmployeeFilters` — not present in current code
- [ ] Extract large inline page components into separate files — **Deferred**: low urgency, cosmetic
- [ ] Make filter dropdown options dynamic from data — **Deferred**: requires new API endpoint and additional complexity

### Content Fixes
- [x] Update schema.sql comments — "Azure Entra ID" → "managed via application UI" / "uses email"
- [x] Home page copy already references "NinjaOne" correctly (no "Azure Entra ID" reference found)

## Verification Checklist
- [x] `npm run build` passes
- [x] No `console.log` in production API routes
- [x] No unused imports or dependencies (zustand, exceljs, auth-helpers removed)
- [x] Sync routes require auth
- [x] Search input is sanitized

## Implementation Notes

### Security
- Sync route now requires `SYNC_CRON_SECRET` to be set AND the `Authorization` header to match. Previously, requests without any auth header bypassed the check entirely.
- Search inputs are sanitized by stripping `%`, `_`, `\`, `(`, `)`, `.`, `,` characters before passing to PostgREST `.ilike()` filters.

### Performance
- Employee list device counts now use a single `SELECT employee_id FROM devices WHERE employee_id IN (...)` instead of N individual queries.
- Employee detail software fetching now uses `SELECT ... FROM device_software WHERE device_id IN (...)` instead of N queries per device.
- Software route pagination and device list dedup are deferred — both require full in-memory datasets for their grouping/dedup logic.

### Code Quality
- `getServiceSupabase()` now returns a cached singleton instead of creating a new client on every call.
- `NinjaOneClient` uses lazy initialization — env vars are read on first API call, not at module import time.
- Removed ~200 lines of debug logging, PII logging, and replication retry logic across API routes.
- Removed 92 npm packages (zustand, exceljs, @supabase/auth-helpers-nextjs and transitive deps).
- Removed unused Azure Graph functions (getUserManager, getUserPhoto, getUserDevices, getAllUsers, getAllUsersWithDevices).
- Removed unused NinjaOne functions (getOrganizations, getTickets, getDeviceCustomFields) and NinjaTicket interface.

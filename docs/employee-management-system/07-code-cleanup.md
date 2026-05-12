# Phase 7: Code Cleanup & Hygiene

## Status: ⬜ Pending

## Overview
Remove dead code, unused dependencies, debug logging, and address code quality issues found in the code review.

## Prerequisites
- ✅ Phase 1–4 complete

## Planned Changes

### Security Fixes
- [ ] Fix sync route auth bypass — always require `SYNC_CRON_SECRET` (not just when header is present)
- [ ] Sanitize search input in employee list API — escape PostgREST special characters in `.or()` filter

### Performance Fixes
- [ ] Replace N+1 device count queries in `GET /api/employees` with single batch query
- [ ] Replace N+1 software queries in `GET /api/employees/[id]` with batch `.in()` query
- [ ] Fix software route to paginate at DB level, not in memory
- [ ] Fix device list dedup — use SQL `DISTINCT ON` instead of loading all into memory

### Bug Fixes
- [ ] Guard `devices ?? []` in Excel sync route to prevent crash on undefined
- [ ] Fix offboard email match — use exact match instead of `.includes()`
- [ ] Fix onboard ID generation — use DB-generated ID instead of `Date.now().slice(-4)`
- [ ] Check error returns on Supabase `update`/`insert` calls in device assignment routes
- [ ] Fix `updateExcelRow` off-by-one risk — align all routes on same `rowIndex + N` convention

### Dependency Cleanup
- [ ] Remove unused `zustand` from `package.json`
- [ ] Remove unused `@supabase/auth-helpers-nextjs` from `package.json`
- [ ] Remove unused `exceljs` from `package.json`

### Dead Code Removal
- [ ] Remove unused `supabase` anon export from `lib/supabase.ts`
- [ ] Remove unused `getExcelWorkbook` from `lib/sharepoint-excel.ts`
- [ ] Remove unused `getUserManager`, `getUserPhoto`, `getUserDevices` from `lib/azure-graph.ts`
- [ ] Remove unused `getTickets`, `getOrganizations`, `getDeviceCustomFields` from `lib/ninjaone.ts`
- [ ] Remove unused `departments`/`offices` state from `EmployeeFilters`
- [ ] Remove `ninjaError` dead variable in `sync/logs/route.ts`

### Logging Cleanup
- [ ] Remove all debug `console.log` statements from API routes
- [ ] Remove `console.log` from `EmployeeCard` component
- [ ] Remove PII logging (emails, phone numbers, department) from employee routes
- [ ] Consider adding a log level env var for conditional logging

### Code Quality
- [ ] Replace `any` types with proper interfaces from `lib/types.ts`
- [ ] Remove manual `updated_at` set in employee PUT (trigger handles it)
- [ ] Remove replication lag retry/sleep logic from employee GET
- [ ] Cache `getServiceSupabase()` as singleton
- [ ] Extract duplicated `getColumnLetter()` into shared utility
- [ ] Add lazy init to `NinjaOneClient` constructor (avoid crash on missing env vars)
- [ ] Extract large inline page components into separate files
- [ ] Make filter dropdown options dynamic from data

### Content Fixes
- [ ] Update home page copy — "Azure Entra ID" → "SharePoint Excel"
- [ ] Update schema.sql comments that reference Entra ID

## Verification Checklist
- [ ] `npm run build` passes
- [ ] No `console.log` in production code (or gated by log level)
- [ ] No unused imports or dependencies
- [ ] All `any` types replaced where feasible
- [ ] Sync routes require auth
- [ ] Search input is safe

## Implementation Notes
[To be added during implementation]

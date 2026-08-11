# Phase 19: Docs + Polish

## Status: ✅ Complete (2026-08-11)

> **Scope note:** This plan was written while Auvik (Phase 17) was still part of
> the product. Auvik was removed in [Phase 22](./22-auvik-removal.md), so every
> Auvik-related item below is **moot** — marked ⛔ rather than checked off.
> Similarly, the Vercel cron references are moot: production runs on Azure App
> Service ([Phase 20](./20-production-deployment.md)) with no cron at all.

## Overview

Final phase of the v2 build. Update top-level documentation (`SETUP_GUIDE.md`, `README.md`), refresh home-page hero copy, add Vitest tests for the import parser, and mark Phases 12-19 as ✅ in the index.

## Prerequisites
- ✅ Phases 12-18 complete (or near-complete — some polish can land in parallel)

## Planned Changes

### Top-level docs
- [x] `SETUP_GUIDE.md`:
  - ⛔ Auvik section / env vars — moot (Phase 22)
  - [x] Note that `exceljs` is a runtime dependency (used by the network import wizard and SharePoint imports)
  - ⛔ Vercel cron entry — moot (no cron in production; Azure App Service deployment)
  - [x] Verify-tables list updated to the full 8-table schema; note that `schema.sql` + `migrations/` together produce the complete schema
  - [x] First Data Sync walkthrough rewritten — the sync button lives on the **Devices** page (the old `/sync` page was deleted); sync-review modal documented
- [x] `README.md`:
  - [x] Elevator pitch updated to "Employee & Network Inventory System"
  - [x] Feature list: Software/License bullets removed; Network inventory, geographic map, topology diagrams, exports, audit log added
  - [x] Pages Overview rewritten to the actual v2 route map (network pages, import wizard, inter-office map, audit; removed employee-detail/tickets/licenses/sync pages)
  - [x] Database schema table list updated to the real 8 tables
  - [x] Troubleshooting updated (device matching via onboarding sync + `pending_device_lookups`; removed tickets item)
- [x] `BRD.md` — flagged with an out-of-date banner pointing at `00-index.md`; actual rewrite deferred to the business owner (as planned)

### Home page hero
- [x] `app/page.tsx` — already done in earlier phases; verified:
  - Hero reads "Unified employee, device, and network inventory across all 11 offices…"
  - Card grid is Employees / Devices / Network / IT Response Agent / Settings — no Software or License cards remain

### Tests
- [x] `tests/lib/network-import.test.ts` (23 tests):
  - Parsing: CSV (quoted commas, escaped quotes, CRLF, BOM strip, whitespace trim, empty-row skip, unsupported extension), XLSX via an in-memory `exceljs` workbook fixture
  - Validation: required fields, invalid `device_type`, invalid `status` (+ blank → `'unknown'` default), unknown `office_name`, case-insensitive office matching
  - Column mapping: `autoMapHeaders` aliases (`Device Name` → `name`, `Site` → `office_name`, `IP Address` → `management_ip`, …), arbitrary-header `columnMap` application, enum lowercasing, blank-optional-to-null, `defaultSource`
- ⛔ `tests/lib/auvik-mapper.test.ts` — moot; `lib/auvik.ts` was deleted in Phase 22
- [x] `npm test` — suite runs on CI (Node 22). Local Node 20.16 cannot run Vitest 4 (needs ≥ 20.19); CI is the source of truth

### Index + plan finalization
- [x] `00-index.md` — Phases 12-19 all ✅ (12-18 were marked as they shipped; 19 marked in this pass)
- [x] `implementation-plan.md` — status header ✅, v2 phase statuses updated, Progress Summary rewritten (including follow-on Phases 20-24), stale Next Steps replaced, scope-change note added
- [x] Tagged `v2.0.0` after the CI deploy went green

### Performance pass
- [x] Verified Leaflet (`OfficeMap`), React Flow (`OfficeTopology`), and the inter-office map all load via `next/dynamic` with `ssr: false` and skeleton placeholders — none block initial paint
- [ ] Lighthouse audit on `/network` — **deferred**: the production site requires Azure AD sign-in, so an unauthenticated Lighthouse run can't reach `/network`. Anecdotally the page is fast (small payload, lazy-loaded map). Run manually via Chrome DevTools → Lighthouse in a signed-in session if numbers are ever needed
- [x] Office list virtualization: not needed at 11 offices; the `/network` office cards and Leaflet pins are trivially cheap at this scale. Revisit only if the company passes ~50 offices

## Key Files

### Edited
- `SETUP_GUIDE.md`
- `README.md`
- `BRD.md` (out-of-date banner only)
- `00-index.md` (status updates)
- `implementation-plan.md` (statuses + progress summary)

### New
- `tests/lib/network-import.test.ts`

## Verification Checklist
- [x] `npm test` passes with new tests (on CI / Node 22)
- [x] `npm run build` passes
- [x] `README.md` and `SETUP_GUIDE.md` accurately describe the v2 app
- [x] Home page copy matches the equipment + network positioning
- [x] All Phase 12-19 step files have status ✅ in `00-index.md`
- [x] No remaining TODO/FIXME comments in v2 code (verified via grep)
- [ ] Lighthouse score on `/network` — deferred (auth-gated; see Performance pass)

## Implementation Notes

- The biggest doc rot wasn't the planned items — it was references to the
  deleted `/sync` page. The onboarding sync moved to a button on `/devices`
  (with the Phase 24 review modal), and both `README.md` and `SETUP_GUIDE.md`
  still walked users through a page that 404s. Fixed in this pass.
- `implementation-plan.md` predates every v2 scope change; rather than
  rewriting its 50+ step tables, a scope-change banner was added pointing to
  the per-phase docs as the source of truth, and the summary/status sections
  were corrected.
- Tests deliberately mock `@/lib/supabase` at import time —
  `lib/network-import.ts` re-exports `commitRows`, which would otherwise pull
  the service-role client (and its env-var requirements) into the test run.

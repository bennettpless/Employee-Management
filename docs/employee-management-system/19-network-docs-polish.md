# Phase 19: Docs + Polish

## Status: ⬜ Pending

## Overview

Final phase of the v2 build. Update top-level documentation (`SETUP_GUIDE.md`, `README.md`), refresh home-page hero copy, add Vitest tests for the import parser and Auvik mapper, and mark Phases 12-19 as ✅ in the index.

## Prerequisites
- ✅ Phases 12-18 complete (or near-complete — some polish can land in parallel)

## Planned Changes

### Top-level docs
- [ ] `SETUP_GUIDE.md`:
  - Add a "Network Inventory" section linking to [17-auvik-integration.md](./17-auvik-integration.md) for Auvik setup
  - Document the new optional env vars: `AUVIK_API_USER`, `AUVIK_API_KEY`, `AUVIK_TENANT_DOMAIN`
  - Note that `exceljs` is now a runtime dependency again (was removed in Phase 7)
  - Note the new Vercel cron entry for Auvik
- [ ] `README.md`:
  - Update the elevator pitch to "Employee & Network Inventory" (was "Employee Management")
  - Update the feature list: remove Software / License inventory bullets; add Network device inventory, geographic map, topology diagrams, exports
  - Update the screenshot/walkthrough section if any references the removed pages
- [ ] `BRD.md` (if it exists and is owned by the team) — flag for the operator that v2 should be reflected; defer the actual edit if BRD is owned outside engineering

### Home page hero
- [ ] `app/page.tsx`:
  - Update the hero subtitle copy (currently mentions "employees, devices, software, and licenses") to reflect the equipment + network focus, e.g.:
    > Track equipment and network infrastructure across all offices. Manage employees, devices, and per-office network maps in one place.
  - Refresh the Key Features section: remove the "Software Inventory" and "License Management" cards; add "Network Mapping" and "Multi-Office Inventory" cards with descriptions matching v2

### Tests
- [ ] `tests/lib/network-import.test.ts`:
  - Parsing: valid CSV, valid XLSX (using a tiny in-memory workbook fixture)
  - Validation: required fields, invalid `device_type`, invalid `status`, unknown `office_name`
  - Column mapping: handles aliases (e.g., `Device Name` → `name`), trims whitespace, lowercases enum values
- [ ] `tests/lib/auvik-mapper.test.ts`:
  - Device-type mapping: known types map correctly, unknown types are filtered out (return `null`/skip)
  - Status mapping: each known status maps; unknown returns `'unknown'`
  - Override semantics: a row with `is_manually_overridden = true` is left untouched by the upsert function
- [ ] Run `npm test` and confirm all suites pass; aim for >80% coverage on the new lib files

### Index + plan finalization
- [ ] `00-index.md`:
  - Mark Phases 12-19 ✅ as each finishes (or all at once at the end of the polish pass)
  - Update Status: 🟡 → ✅ at the top once everything is shipped
- [ ] `implementation-plan.md`:
  - Update the v2 Progress Summary table — increment Done counts and statuses
- [ ] Tag a release: `git tag v2.0.0` once everything is merged and deployed

### Performance pass
- [ ] Lighthouse audit on `/network` (target: LCP < 2.5s, CLS < 0.1)
- [ ] Verify Leaflet tiles + React Flow lazy-load and don't block initial paint
- [ ] Verify the office list is paginated or virtualized if the company ever has > 50 offices (not a concern at 11, but a one-line config worth noting)

## Key Files

### Edited
- `SETUP_GUIDE.md`
- `README.md`
- `app/page.tsx` (hero copy + key features)
- `00-index.md` (status updates)
- `implementation-plan.md` (progress summary)

### New
- `tests/lib/network-import.test.ts`
- `tests/lib/auvik-mapper.test.ts`

## Verification Checklist
- [ ] `npm test` passes with new tests
- [ ] `npm run build` passes
- [ ] `README.md` and `SETUP_GUIDE.md` accurately describe the v2 app
- [ ] Home page copy matches the new equipment + network positioning
- [ ] All Phase 12-19 step files have status ✅ in `00-index.md`
- [ ] No remaining TODO/FIXME comments in v2 code
- [ ] Lighthouse score on `/network` is acceptable (LCP, CLS, TBT)

## Implementation Notes
_Added during/after implementation._

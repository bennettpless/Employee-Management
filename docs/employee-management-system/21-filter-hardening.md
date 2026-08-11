# Phase 21: Filter Hardening + Canonical Departments

## Status: 🟡 In Progress

## Overview

Lock the `/devices` filter dropdowns to a small, hardcoded set of canonical values (Departments + Locations) and flag any device rows whose current value falls outside those sets so admins can clean them up. Also extend the onboarding sync's title-based department rule so every newly-onboarded employee gets an appropriate department — not just Engineers, Designers, and BPL folks.

## Motivation

Today the `/devices` page derives its Department and Location dropdowns from the DISTINCT values found in the `devices` table. Two problems:
- A typo or one-off value (e.g. someone typed "Enigneer" or "Marketing") shows up as a legitimate filter option.
- The onboarding sync only auto-assigns three departments (BPL / Engineer / Designer) and leaves everyone else with `null`, so the filter dropdown misses Admin and Leadership entirely.

Phase 21 hardcodes the canonical list of five departments, extends the sync's title matcher to cover Leadership + Admin, and marks out-of-list rows with a visible warning.

## Scope decisions (2026-07)

- **Five canonical departments** (in alphabetical order): `Admin`, `BPL`, `Designer`, `Engineer`, `Leadership`.
- **Locations** stay office-driven: canonical list = every office's short name (per `officeNameToLocation`) + `Remote`. Adding an office at `/settings/offices` automatically adds it to the filter dropdown.
- **Only new syncs get the new rules.** Existing device rows are never rewritten retroactively — the sync only writes `department` on records it's actively creating or reassigning. Devices already in the DB keep whatever value (or `null`) they had.
- **Non-canonical values are flagged, not erased.** A row whose `department` or `location` is not in the canonical set gets a small ⚠ next to that cell + shows up in a "N devices need cleanup" banner at the top of the page. Admins fix each one manually via the existing device edit modal.
- **`null` is treated as "unset", not as an error.** Only non-null-but-non-canonical values (e.g. `Marketing`, `IT Support`) are flagged. This keeps the UI usable while the historic data has a lot of `null` departments.
- **Admin can still override.** The device edit form lets admins set the department to any of the five canonical values (or leave it blank). The sync rules just decide the default on first assignment; nothing prevents a human from correcting a mislabel afterward.

## Sync rules (priority order)

The onboarding sync assigns a device's department from the employee's email + job title using the first matching rule:

1. Email ends with `@bpl-enclosure.com` → **`BPL`** (wins over title)
2. Title contains any of: `department manager`, `executive`, `director`, `vice president`, `vp`, `president` (word-boundary, case-insensitive) → **`Leadership`**
3. Title contains `engineer` (any case, substring match — covers "Design Engineer", "Software Engineer", etc.) → **`Engineer`**
4. Title contains `BIM` (word boundary, case-insensitive) → **`Designer`**
5. Everything else → **`Admin`** (default fallback — covers IT, accounting, marketing, receptionist, etc.)

## Known edge cases

- `Executive Assistant` matches rule 2 → `Leadership`, but is really Admin. Admins fix these manually after the sync.
- `Design Engineer` matches rule 3 → `Engineer` (deliberate — design engineers file under Engineer, which was the existing behavior).
- `Director of BIM` matches rule 2 → `Leadership` (Leadership rules run first). If we ever have a BIM Director whom you'd rather file under Designer, admins can edit manually.

## Planned Changes

### `lib/devices.ts`
- [ ] Export a `DEPARTMENTS` constant + `Department` type:
  ```ts
  export const DEPARTMENTS = ['Admin', 'BPL', 'Designer', 'Engineer', 'Leadership'] as const
  export type Department = typeof DEPARTMENTS[number]
  ```
- [ ] Rewrite `departmentFromTitle` to always return a `Department` (never `null`) using the priority-ordered rules above.
- [ ] `departmentForEmployee` follows suit — no longer returns `null`.

### `app/api/sync/onboarding/route.ts`
- [ ] The two conditional-spread patterns
  ```ts
  ...(dept ? { department: dept } : {})
  ```
  simplify to
  ```ts
  department: dept
  ```
  since `dept` is now guaranteed non-null. This means every device assigned or reassigned by the sync now gets a department, even for pure-Admin employees who previously ended up with `null`.

### `app/api/devices/route.ts`
- [ ] Import `DEPARTMENTS`; return it as `departments` in the response instead of computing distinct values from the DB.
- [ ] Compute `locations` as `[...officeShortNames, 'Remote']` only — no longer merge in stray device values.
- [ ] Add two new response fields:
  - `flaggedDepartments`: distinct non-null `devices.department` values not in `DEPARTMENTS`
  - `flaggedLocations`: distinct non-null `devices.location` values not in the canonical list
  - (`null` values are NOT flagged — they're just "unset".)

### `app/devices/page.tsx`
- [ ] Consume `flaggedDepartments` / `flaggedLocations` from the API.
- [ ] Render a yellow banner above the filters when the flagged count > 0: "N device(s) have out-of-list department or location values. Click a row to fix."
- [ ] In the device table, when a row's `department` is in `flaggedDepartments`, wrap the cell in a `<span title="Not one of the canonical departments — please fix">` with an `AlertTriangle` icon. Same treatment for `location`.

### Tests
- [ ] `tests/lib/devices.test.ts` — new file covering every branch of the priority-ordered rules, including the tricky edges (`Director of BIM` → Leadership, `Design Engineer` → Engineer, `@bpl-enclosure.com` + `Director` → BPL, empty/null inputs → Admin).

## Key Files

### New
- `docs/employee-management-system/21-filter-hardening.md` (this file)
- `tests/lib/devices.test.ts`

### Edited
- `lib/devices.ts` (rules + constants + type)
- `app/api/sync/onboarding/route.ts` (drop conditional spreads)
- `app/api/devices/route.ts` (hardcode dropdown lists + flagged arrays)
- `app/devices/page.tsx` (banner + row warning icons)
- `docs/employee-management-system/00-index.md` (add Phase 21 row)

## Verification Checklist
- [ ] `departmentFromTitle` returns `Leadership` for "VP of Engineering", "Director of Ops", "Executive Vice President", "President", "Department Manager"
- [ ] `departmentFromTitle` returns `Engineer` for "Software Engineer", "Design Engineer", "Senior Structural Engineer"
- [ ] `departmentFromTitle` returns `Designer` for "BIM Designer", "BIM Modeler" (any title containing the BIM word)
- [ ] `departmentFromTitle` returns `Admin` for "Receptionist", "Accountant", "IT Support", empty string, null
- [ ] `departmentForEmployee(email, title)` returns `BPL` whenever the email ends with `@bpl-enclosure.com`, regardless of title
- [ ] `/api/devices` returns `departments: ['Admin', 'BPL', 'Designer', 'Engineer', 'Leadership']` (fixed order)
- [ ] `/api/devices` returns `flaggedDepartments` listing any current DB values outside that set
- [ ] `/devices` department + location dropdowns show only canonical values
- [ ] Devices with non-canonical values show a ⚠ next to the offending cell
- [ ] Cleanup banner appears when the flagged count > 0; disappears when everything is canonical
- [ ] New employees onboarded via `/api/sync/onboarding` are getting devices tagged with the correct department per the rules above

## Implementation Notes

**Tests written but not yet runnable (2026-07):**
`tests/lib/devices.test.ts` covers every branch of `departmentFromTitle` +
`departmentForEmployee` (~20 assertions). The suite could not be executed
because `vitest` 4.1.6 fails to load `vitest.config.ts` on this workstation
with `Error [ERR_REQUIRE_ESM]: require() of ES Module ...\node_modules\std-env\dist\index.mjs`
— a Node/std-env ESM/CJS incompatibility that predates this phase. Anyone who
fixes the vitest runner (upgrade Node past 20.19, or reinstall with a matching
`std-env`) should re-run `npm test` and paste the green summary in here.

**Existing device rows are untouched:**
The sync change only affects records the sync actively creates or reassigns
from this point forward. Devices already in the DB keep whatever
`department` / `location` value they had. Rows outside the canonical sets
render an ⚠ icon and are counted in the "N device(s) need cleanup" banner so
admins can walk through them and pick the correct canonical value manually.

**Edit modal accepts non-canonical values on read:**
`DeviceFormModal`'s Department dropdown is now a strict `<select>` limited to
the five canonical departments, plus one dynamic option for the record's
current value IF it's non-canonical (so opening the modal doesn't silently
blank the field). That extra option is labelled `⚠ <value> (non-canonical)`.

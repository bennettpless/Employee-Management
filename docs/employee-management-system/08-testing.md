# Phase 8: Testing

## Status: ✅ Complete

## Overview
Set up a test framework and add unit, integration, and component tests for critical paths.

## Prerequisites
- ✅ Phase 1–5 complete
- ✅ Phase 7 complete (cleaner code is easier to test)

## Planned Changes
- [x] Set up Vitest + add `test` script to `package.json`
- [x] Unit tests for `lib/excel-mapper.ts` (31 tests)
- [x] Unit tests for `lib/env.ts` (5 tests)
- [x] API route integration tests — employee CRUD (11 tests)
- [x] Component tests for `EmployeeCard`, `EmployeeFilters` (23 tests)

## Setup

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom
```

### Config: `vitest.config.ts`
- Uses `@vitejs/plugin-react` for JSX
- jsdom environment for component tests
- `@` path alias mapped to project root (matches `tsconfig.json`)
- Setup file: `tests/setup.ts` (jest-dom matchers + cleanup)

### Scripts added to `package.json`
- `npm test` — single run (`vitest run`)
- `npm run test:watch` — watch mode (`vitest`)
- `npm run test:coverage` — with coverage report

## Test Structure

```
tests/
├── setup.ts                          # jest-dom matchers + cleanup
├── lib/
│   ├── excel-mapper.test.ts          # 31 tests
│   └── env.test.ts                   # 5 tests
├── api/
│   └── employees.test.ts             # 11 tests
└── components/
    ├── EmployeeCard.test.tsx          # 14 tests
    └── EmployeeFilters.test.tsx       # 9 tests
```

**Total: 70 tests across 5 files**

## Test Coverage Summary

### 1. Excel Mapper (31 tests — data integrity)
- `mapExcelRowToEmployee` — basic field mapping, email normalization, empty row handling
- Device parsing — single/multiple/semicolon-separated names, date removal from parentheses, type matching
- Software license detection — "Yes", "Y", true, "1", 1, and negative cases
- Boolean flags — parseBoolean for Intune, Ninja, MFA fields
- `mapEmployeeToExcelRow` — reverse mapping, LAST_FIRST formatting, Yes/No flags, device/license columns
- Round-trip — Excel → Employee → Excel preserves core data

### 2. Env Validation (5 tests)
- Passes when all required vars present
- Throws listing specific missing vars
- Includes setup guide reference in error

### 3. Employee API Routes (11 tests — mocked Supabase)
- `GET /api/employees` — returns list, applies status/department/search filters, sanitizes search input
- `GET /api/employees/[id]` — returns employee with devices, returns 404/500 for missing
- `POST /api/employees/onboard` — validates email required (400), creates employee (200)
- `PUT /api/employees/[id]` — updates fields, returns 404 when not found

### 4. EmployeeCard Component (14 tests)
- Renders name, email, job title, department, office, phone, device count, status badge
- Falls back to first+last when display_name is null
- Links to correct detail page
- Hides null optional fields
- Handles all three status badge colors

### 5. EmployeeFilters Component (9 tests)
- Renders search input and Filters toggle
- Emits initial empty filter state
- Emits search changes on typing
- Shows/hides dropdown filters on toggle
- Emits status filter changes
- Shows Clear button when filters active
- Resets all filters on Clear click
- Shows active filter count badge

## Verification Checklist
- [x] `npm test` runs and passes (70/70)
- [x] Excel mapper tests cover mapping, parsing, round-trip
- [x] API routes have smoke tests with mocked Supabase
- [x] Components render without errors
- [x] `npm run build` succeeds
- [x] CI can run tests (`npm test` is a single command)

## Implementation Notes

### Mocking strategy
- `lib/azure-graph` is mocked at module level in excel-mapper tests to prevent MSAL `ConfidentialClientApplication` from instantiating at import time (it requires env vars)
- `lib/supabase` is mocked in API tests with a chainable mock that simulates Supabase query builder pattern
- `next/link` is mocked as a plain `<a>` tag in component tests

### Decisions made
- Chose Vitest over Jest — native ESM support, faster, better Vite compatibility
- Used `@testing-library/user-event` over `fireEvent` for more realistic interaction simulation
- API tests use module-level Supabase mock rather than HTTP-level mocking (simpler, tests route logic directly)
- Explicit `cleanup()` in setup.ts `afterEach` to prevent DOM accumulation between tests

# Phase 8: Testing

## Status: ⬜ Pending

## Overview
Set up a test framework and add unit, integration, and E2E tests for critical paths.

## Prerequisites
- ✅ Phase 1–5 complete
- Recommended: Phase 7 complete (cleaner code is easier to test)

## Planned Changes
- [ ] Set up Vitest (or Jest) + add `test` script to `package.json`
- [ ] Unit tests for `lib/excel-mapper.ts`
- [ ] Unit tests for `lib/types.ts` type guards (if added)
- [ ] API route integration tests (employee CRUD, sync endpoints)
- [ ] Component tests for `EmployeeCard`, `EmployeeFilters`
- [ ] E2E test for sync flow (Excel sync → verify data appears)

## Setup

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

## Priority Test Cases

### 1. Excel Mapper (highest value — data integrity)
- `mapExcelRowToEmployee` correctly maps all fields
- Device names are parsed and dates removed from parentheses
- Software license flags are detected (Yes, Y, true, 1)
- Empty/null rows return sensible defaults
- `mapEmployeeToExcelRow` round-trips correctly
- `parseBoolean` handles all variants

### 2. Employee API Routes
- `GET /api/employees` returns filtered results
- `GET /api/employees/[id]` returns 404 for invalid ID
- `PUT /api/employees/[id]` validates input and updates correctly
- `POST /api/employees/onboard` creates employee and returns success

### 3. Component Tests
- `EmployeeCard` renders name, email, status badge, device count
- `EmployeeFilters` emits filter state on change
- `EmployeeFilters` clear button resets all filters

## Verification Checklist
- [ ] `npm test` runs and passes
- [ ] Excel mapper has >80% coverage
- [ ] API routes have smoke tests
- [ ] Components render without errors
- [ ] CI can run tests (when CI is added)

## Implementation Notes
[To be added during implementation]

# Phase 6: Error Handling & Resilience

## Status: ⬜ Pending

## Overview
Add framework-level error boundaries, loading states, not-found pages, and dynamic health checks to make the application resilient and user-friendly when things go wrong.

## Prerequisites
- ✅ Phase 1–5 complete (or in progress)

## Planned Changes
- [ ] Add root `app/error.tsx` error boundary
- [ ] Add root `app/not-found.tsx` custom 404 page
- [ ] Add root `app/loading.tsx` for route-level suspense fallback
- [ ] Add route-specific `error.tsx` for `/employees`, `/devices`, `/sync`
- [ ] Add dynamic health checks on Settings page (verify DB, Graph, NinjaOne connectivity)

## Implementation Details

### `app/error.tsx`
```tsx
'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h2>
        <p className="text-gray-600 mb-6">{error.message || 'An unexpected error occurred'}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
```

### `app/not-found.tsx`
```tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-gray-900 mb-4">404</h2>
        <p className="text-gray-600 mb-6">Page not found</p>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
```

### Settings health checks
Add API endpoints or client-side checks that verify:
- Supabase: `SELECT 1` query succeeds
- Microsoft Graph: Token acquisition succeeds
- NinjaOne: Token acquisition succeeds

## Verification Checklist
- [ ] `error.tsx` catches and displays runtime errors gracefully
- [ ] `not-found.tsx` renders for invalid routes
- [ ] `loading.tsx` shows during route transitions
- [ ] Settings page shows live connection status (green/red)
- [ ] `npm run build` passes

## Implementation Notes
[To be added during implementation]

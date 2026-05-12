# Phase 6: Error Handling & Resilience

## Status: ✅ Complete

## Overview
Add framework-level error boundaries, loading states, not-found pages, and dynamic health checks to make the application resilient and user-friendly when things go wrong.

## Prerequisites
- ✅ Phase 1–5 complete (or in progress)

## Planned Changes
- [x] Add root `app/error.tsx` error boundary
- [x] Add root `app/not-found.tsx` custom 404 page
- [x] Add root `app/loading.tsx` for route-level suspense fallback
- [x] Add route-specific `error.tsx` for `/employees`, `/devices`, `/sync`
- [x] Add dynamic health checks on Settings page (verify DB, NinjaOne connectivity)

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
- [x] `error.tsx` catches and displays runtime errors gracefully
- [x] `not-found.tsx` renders for invalid routes
- [x] `loading.tsx` shows during route transitions
- [x] Settings page shows live connection status (green/red)
- [x] `npm run build` passes

## Implementation Notes
- Root `app/error.tsx` provides a catch-all error boundary with "Try again" and "Back to Home" actions, styled consistently with the app's gradient background.
- Root `app/not-found.tsx` shows a branded 404 page with a large heading and navigation back to home.
- Root `app/loading.tsx` displays a centered spinner with "Loading..." text during route transitions.
- Route-specific `error.tsx` files for `/employees`, `/devices`, and `/sync` provide contextual error messages (e.g., "Failed to load employees") with a "Retry" button and "Back to Home" link.
- `GET /api/health` endpoint runs parallel checks against Supabase (head query on employees table) and NinjaOne (OAuth token acquisition), returning status, latency, and error details.
- Settings page now fetches `/api/health` on mount and shows a live status banner (green "All systems operational" or red "One or more services have issues"), per-service status badges with latency, error details when applicable, and a manual "Check Health" refresh button with timestamp.
- Graph health check was omitted since Azure Graph/SharePoint integration is disconnected per architectural decisions.

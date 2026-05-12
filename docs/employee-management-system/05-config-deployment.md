# Phase 5: Configuration & Deployment

## Status: ✅ Complete

## Overview
Configure Next.js, Tailwind, TypeScript, and Vercel deployment including cron scheduling.

## Prerequisites
- ✅ Phase 1–4 complete

## Planned Changes
- [x] Next.js config — image domains, dev webpack fix (`next.config.js`)
- [x] Tailwind config with custom primary palette (`tailwind.config.ts`)
- [x] TypeScript config with path aliases (`tsconfig.json`)
- [x] Vercel cron for daily NinjaOne sync (`vercel.json`)
- [x] Environment variable documentation (`README.md`, `SETUP_GUIDE.md`)
- [x] Add runtime environment variable validation

## Key Files
- `next.config.js`
- `tailwind.config.ts`
- `tsconfig.json`
- `vercel.json`
- `lib/env.ts`
- `instrumentation.ts`
- `README.md`, `SETUP_GUIDE.md`, `SHAREPOINT_SETUP.md`

## Remaining Work

### Runtime env validation
Create a startup guard that validates all required environment variables:

```typescript
// lib/env.ts
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'SHAREPOINT_SITE_PATH',
  'SHAREPOINT_FILE_PATH',
] as const

export function validateEnv() {
  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}
```

## Verification Checklist
- [x] `next build` passes
- [x] Vercel cron schedule is correct (daily 03:00 UTC)
- [x] Environment variables are documented
- [x] Runtime env validation catches missing variables at startup

## Implementation Notes
- `next.config.js` disables webpack cache in dev to fix Windows hang issue
- `images.domains` includes `graph.microsoft.com` for potential user photos
- NinjaOne cron runs daily at `0 3 * * *` — only NinjaOne, not Excel (Excel sync is manual)
- Runtime env validation via `lib/env.ts` runs at server startup through Next.js `instrumentation.ts` hook
- Validation covers both the original 8 vars from the spec plus `NINJA_CLIENT_ID` and `NINJA_CLIENT_SECRET`
- `NINJA_REGION` is optional (defaults to `'us'` in `lib/ninjaone.ts`)

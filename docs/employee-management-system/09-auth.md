# Phase 9: Authentication & Authorization

## Status: ⬜ Pending (Future — out of scope for v1)

## Overview
Add in-app authentication and role-based access control. Currently, access is controlled at the network level (VPN / private URL). This phase would add login, session management, and role enforcement.

## Prerequisites
- ✅ Phase 1–8 complete (recommended)

## Planned Changes
- [ ] Decide auth strategy (Supabase Auth, Azure AD/Entra, or NextAuth)
- [ ] Add `middleware.ts` for route protection
- [ ] Create login/logout pages
- [ ] Add session checks to all API routes
- [ ] Define roles (Viewer, Operator, Admin)
- [ ] Implement RBAC on routes and UI elements

## Options to Evaluate

### Option A: Supabase Auth
- `@supabase/auth-helpers-nextjs` is already in `package.json`
- Works with existing RLS policies (which check `authenticated` role)
- Supports email/password, magic link, OAuth

### Option B: Azure AD / Entra ID
- Employees already have Azure accounts (organization uses Office 365)
- SSO experience — no separate credentials
- Uses `@azure/msal-node` which is already installed

### Option C: NextAuth.js
- Framework-agnostic, supports many providers
- Would need to be added as a new dependency
- Good if you want to support multiple auth providers

## Open Questions
- [ ] Which auth provider aligns best with the organization's existing identity?
- [ ] Should all pages require auth, or just write operations?
- [ ] What roles are needed? (Viewer, Operator, Admin? Or simpler?)
- [ ] Should the sync cron secret remain separate from user auth?

## Implementation Notes
[To be added when this phase is scoped]

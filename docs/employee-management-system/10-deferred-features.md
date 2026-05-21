# Phase 10: Deferred Features

## Status: ⬜ Pending (Future — out of scope for v1)

## Overview
Features that are referenced in the schema, BRD, or README but were explicitly deferred from the v1 release.

## Planned Changes

### ~~Ticketing~~ — Replaced by Phase 11 (IT Response Agent)

Ticketing functionality is now covered by the IT Response Agent integration (Phase 11). The IT Response Agent syncs tickets from NinjaOne, generates AI recommendations, and provides a full review/forward workflow. The `tickets` table in `schema.sql` will be retained for use by the IT Response Agent.

### Azure Entra ID Sync
- [ ] Add Entra ID as alternative/supplementary employee source
- [ ] Create `POST /api/sync/entra` endpoint
- [ ] Map Entra user fields to employee record
- [ ] Handle merge logic when employee exists from both Excel and Entra

**Context:** The `azure-graph.ts` library already has `getAllUsers()` and related functions. The original schema was designed for Entra before Excel became the primary source.

### CI/CD Pipeline
- [ ] Add GitHub Actions workflow for lint + build on PR
- [ ] Add test step (after Phase 8)
- [ ] Add deployment step for Vercel (or auto-deploy via Vercel GitHub integration)

### Docker
- [ ] Create `Dockerfile` for self-hosted deployment
- [ ] Create `docker-compose.yml` with app + local Supabase

### Additional Enhancements
- [ ] Bulk import/export employees (CSV upload)
- [ ] Email notifications on sync failures
- [ ] Dashboard metrics (employee count, device count, license utilization)
- [ ] Audit log for user actions (who changed what, when)

## Open Questions
- [x] Is ticketing still a desired feature, or should the `tickets` table be removed? — **Resolved: tickets table retained; ticketing replaced by IT Response Agent (Phase 11)**
- [ ] Is Entra ID sync still planned, or is Excel sufficient long-term?
- [ ] Should CI/CD be prioritized before other deferred features?

## Implementation Notes
[To be added when features are scoped]

# Phase 10: Deferred Features

## Status: ✅ Closed (2026-08-11) — every item either shipped elsewhere or was dropped

## Overview
Features that were referenced in the schema, BRD, or README but explicitly deferred from the v1 release. Triaged and closed after v2 shipped: nothing on this list remains planned.

## Resolution

### Ticketing — ✅ Replaced by Phase 11 (IT Response Agent)
Ticketing functionality is covered by the IT Response Agent integration (Phase 11). The agent syncs tickets from NinjaOne, generates AI recommendations, and provides a full review/forward workflow at `/response-agent`. The `tickets` table in `schema.sql` is retained.

### Azure Entra ID Sync — ❌ Dropped
Never built, and its rationale is gone: it was conceived as an alternative to the Excel roster, but employees now come from the onboarding workbook sync (with the Phase 24 review flow). The `azure-graph.ts` Graph client still exists (used for SharePoint workbook access), so an Entra sync could be revived if a class of employees ever bypasses onboarding — but none does today.

### CI/CD Pipeline — ✅ Shipped in Phase 20
`.github/workflows/deploy-azure.yml` runs on every push to `main`: `npm ci` → `npm test` → `npm run build` (includes Next's lint + type check) → deploy to Azure App Service → smoke test. PR-triggered checks weren't added because the workflow is push-to-main; add a PR workflow if branch-based development ever starts.

### Docker — ❌ Dropped
Superseded by the Phase 20 Azure App Service deployment (standalone Next.js build, `node server.js`). The self-hosted plan is archived in [20-production-deployment.md](./20-production-deployment.md).

### Additional Enhancements
- **Bulk employee CSV import/export** — ❌ Dropped. Network devices got import (Phase 14) + export (Phase 18); employee volume (onboarding a few people at a time) doesn't justify a bulk path.
- **Email notifications on sync failures** — ❌ Dropped as moot. This assumed unattended cron syncs; there is no cron anymore. The only sync is the manual button on `/devices`, where failures surface immediately in the UI.
- **Dashboard metrics on home page** — ❌ Dropped. The `/network` dashboard has aggregate stats; plain counts on the home cards weren't worth the extra queries. (License utilization is moot — licenses were removed in Phase 12.)
- **Audit log** — ✅ Shipped. `/audit` lists every create/update/delete with actor and timestamp.

## Open Questions
- [x] Is ticketing still a desired feature, or should the `tickets` table be removed? — **Resolved: tickets table retained; ticketing replaced by IT Response Agent (Phase 11)**
- [x] Is Entra ID sync still planned, or is Excel sufficient long-term? — **Resolved: dropped (2026-08-11); onboarding workbook sync is the employee source**
- [x] Should CI/CD be prioritized before other deferred features? — **Resolved: shipped with the Phase 20 Azure deployment**

## Implementation Notes
- Closed 2026-08-11 during the post-v2 triage. Ticketing, CI/CD, and the audit log shipped via Phases 11, 20, and the audit work respectively; Docker, Entra sync, bulk employee CSV, email notifications, and home-page metrics were dropped by operator decision.

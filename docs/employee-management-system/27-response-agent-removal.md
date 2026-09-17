# Phase 27: IT Response Agent Removal

## Status: ✅ Complete

## Overview

Remove the IT Response Agent (ticket response tracker) embed from this app. Phase 11 shipped an iframe of the agent's `review.html` at `/response-agent`, a home-page card, a nav item, and a live pending-review badge via `embed.js`. None of that is needed here.

Phase 26 (Ninja ticket → device repair history) talks to **NinjaOne directly** and does not use the agent. The agent remains a separate product; this phase only stops embedding it in EMS.

## Motivation

Operator decision (2026-09-01): the Response Agent is not part of this inventory app, and the parked repair-history work does not depend on it.

## What was removed

- `app/response-agent/page.tsx` (iframe page)
- Home dashboard card + `embed.js` Script (`app/page.tsx`)
- Nav item "Response Agent" (`components/AppHeader.tsx`)
- Required env vars `IT_RESPONSE_AGENT_URL` and `IT_RESPONSE_AGENT_API_KEY` (`lib/env.ts`, `tests/lib/env.test.ts`, `.env.example`)
- GitHub Actions build secrets for those two vars (`.github/workflows/deploy-azure.yml`)
- Operator setup for the agent (`README.md`, `SETUP_GUIDE.md`)

## What was left alone

- The unused `tickets` table in `schema.sql` (never wired; Phase 26 writes `device_history`, not this table)
- Auth allowlists that happened to match the agent's (`@bennett-pless.com` / admin emails) — those are EMS rules, not an agent dependency
- Historical Phase 11 / Phase 20 write-ups (marked stale where they describe the embed as live)

## After deploy (ops)

These are unused once this ships; delete when convenient:

- Azure App Service application settings: `IT_RESPONSE_AGENT_URL`, `IT_RESPONSE_AGENT_API_KEY`
- GitHub repo secrets of the same names
- Local `.env.local` copies of those vars (harmless if left)

No change is required on the IT Response Agent App Service (`PORTAL_ORIGIN` can stay; EMS no longer loads it).

## Verification

- [x] `/` has no IT Response Agent card and does not load `embed.js`
- [x] Header has no Response Agent link
- [x] `/response-agent` is gone (Next 404)
- [x] App boots without `IT_RESPONSE_AGENT_*` env vars
- [x] `npm test` — `validateEnv` suite no longer requires those vars

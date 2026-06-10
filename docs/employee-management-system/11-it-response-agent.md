# Phase 11: IT Response Agent Integration

## Status: ✅ Complete

## Overview
Integrate the [IT Response Agent](https://github.com/bennettpless/IT-Response-Agent) into the Employee Management app as a dedicated section. The IT Response Agent is a standalone Express.js API server that syncs tickets from NinjaOne, generates AI-recommended responses using OpenAI, and provides an admin review dashboard for accepting, editing, rejecting, and forwarding those responses.

For v1, the agent's `review.html` dashboard is embedded via iframe. The notification badge (`embed.js`) is added to the main dashboard to show pending review count.

## Prerequisites
- ✅ Phase 9 complete (Azure AD SSO — auth gates access to the response agent page)
- IT Response Agent server is deployed and reachable (e.g., `https://app-itticketagent-api-prod.azurewebsites.net`)
- `AGENT_API_KEY` is configured on the IT Response Agent server

## IT Response Agent — Architecture Summary

The IT Response Agent is a separate codebase (`bennettpless/IT-Response-Agent`) with its own:
- **Backend**: Express.js + TypeScript, Azure Postgres database
- **Frontend**: `review.html` (vanilla HTML/JS) — full admin review dashboard
- **Auth**: Azure AD SSO via MSAL (same tenant as this app), plus API key auth for server-to-server access
- **Integrations**: NinjaOne (ticket sync), OpenAI (AI response generation), Microsoft Graph (email forwarding)

### Key API Endpoints (on the IT Response Agent server)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/recommendations/stats` | GET | Badge counts: `{ pending, accepted, edited, rejected, forwarded, total }` |
| `/api/recommendations` | GET | List recommendations (query: `status`, `ticket_id`, `page`, `limit`) |
| `/api/recommendations/:id` | GET | Single recommendation with ticket context |
| `/api/recommendations/:id/accept` | POST | Accept a pending recommendation |
| `/api/recommendations/:id/reject` | POST | Reject with optional `{ reason }` body |
| `/api/recommendations/:id/edit` | POST | Edit and accept: `{ edited_response }` |
| `/api/recommendations/:id/forward` | POST | Forward to user: `{ channels: ["email"] }` or `["ninja"]` |
| `/api/recommendations/:id/regenerate` | POST | Generate a fresh AI response |
| `/api/recommendations/generate` | POST | Trigger generation: `{ ticket_id }` |
| `/api/tickets` | GET | List tickets with pagination and filtering |
| `/api/tickets/:ticketId` | GET | Single ticket with full detail |

All endpoints require the `X-API-Key` header (value: `AGENT_API_KEY`).

### Key Files in the IT Response Agent Repo

| File | Purpose |
|------|---------|
| `frontend/review.html` | Admin review dashboard UI (embedded via iframe) |
| `frontend/embed.js` | Notification badge script for pending review count |
| `frontend/INTEGRATION.md` | Official portal integration guide |
| `src/routes/recommendations.ts` | Recommendations API (accept/reject/edit/forward/generate) |
| `src/routes/tickets.ts` | Tickets API (list/detail with comments) |
| `src/services/responseAgent.ts` | AI response generation service (OpenAI + vector search) |
| `src/services/responseForwarder.ts` | Email/NinjaOne forwarding service |

## Planned Changes

### New Page
- [x] Create `app/response-agent/page.tsx` — IT Response Agent review dashboard
  - Embeds `review.html` via iframe: `{IT_RESPONSE_AGENT_URL}/review.html?key={IT_RESPONSE_AGENT_API_KEY}`
  - Full-height iframe with no border (`width: 100%; height: 100vh; border: none`)
  - Page title and back navigation consistent with other pages
  - Auth-protected (Phase 9 middleware handles this)

### Dashboard Integration
- [x] Update `app/page.tsx` — add "IT Response Agent" card to the dashboard grid
  - New card with appropriate icon (e.g., `MessageSquare` or `Bot` from lucide-react)
  - Links to `/response-agent`
  - Include notification badge showing pending review count
- [x] Add notification badge using the agent's `embed.js` script
  - Script src: `{IT_RESPONSE_AGENT_URL}/embed.js`
  - Attributes: `data-api-url`, `data-api-key`, `data-poll-interval="30"`
  - Badge element: `<span id="ai-review-badge">` styled next to the card

### Environment Configuration
- [x] Update `lib/env.ts` — add required env vars:
  - `IT_RESPONSE_AGENT_URL` — base URL of the IT Response Agent server
  - `IT_RESPONSE_AGENT_API_KEY` — API key for server-to-server access

### IT Response Agent Server Configuration
- [ ] Set `PORTAL_ORIGIN` on the IT Response Agent deployment (deployment-time action — not a code change)
  - Value: the Employee Management app's production origin (TBD pending the Phase 20 deployment-direction decision) plus `http://localhost:3000` for dev — comma-separated
  - This allows the iframe to load and `embed.js` to make cross-origin requests
  - The Phase 20 doc has a draft message-to-Bennett (Appendix D) that should be re-tailored once the prod URL is known

## Key Files
- `app/response-agent/page.tsx` — response agent page (new)
- `app/page.tsx` — updated with IT Response Agent card and badge
- `lib/env.ts` — updated with new required env vars

## Integration Pattern

```
Employee Management App (Next.js)
├── /response-agent (page.tsx)
│   └── <iframe src="{AGENT_URL}/review.html?key={API_KEY}" />
│       └── Full AI review dashboard (accept/reject/edit/forward)
│
├── / (page.tsx - dashboard)
│   └── IT Response Agent card
│       └── <span id="ai-review-badge"> (live pending count)
│
└── <script src="{AGENT_URL}/embed.js" /> (polls /api/recommendations/stats)

IT Response Agent (Express.js)
├── /review.html (served as static file)
├── /embed.js (notification badge script)
├── /api/recommendations/* (AI review workflow)
├── /api/tickets/* (NinjaOne ticket data)
└── PORTAL_ORIGIN={EMS_URL} (allows iframe embedding)
```

## Future Considerations
- **Native React rebuild**: Replace the iframe with React components that call the agent's API directly. Better UX (consistent styling, no iframe quirks), but significantly more work.
- **Shared auth session**: Currently the iframe uses API key auth. A future enhancement could pass the user's Azure AD session to the agent for per-user audit trails.
- **Unified database**: If both apps eventually share a database, the agent's tables (`tickets`, `agent_recommendations`, `ticket_comments`, etc.) could be accessed directly instead of through API calls.

## Verification Checklist
- [ ] IT Response Agent card appears on the main dashboard
- [ ] Notification badge shows pending review count (updates every 30 seconds)
- [ ] Clicking the card navigates to `/response-agent`
- [ ] iframe loads `review.html` with full functionality (list, filter, accept, reject, edit, forward)
- [ ] iframe respects CORS — `PORTAL_ORIGIN` is set correctly on the agent server
- [ ] Auth-protected — unauthenticated users cannot access `/response-agent` (handled by Phase 9 middleware)
- [ ] Environment variables are validated on startup

## Implementation Notes

### Files changed
- `app/response-agent/page.tsx` — **new**. Server component that reads `IT_RESPONSE_AGENT_URL`/`IT_RESPONSE_AGENT_API_KEY` from env and renders the agent's `review.html` in a full-height iframe. If env vars are missing, renders a configuration error panel instead of crashing. Marked `dynamic = 'force-dynamic'` so the page is rendered per-request (env-dependent) and not statically prerendered.
- `app/page.tsx` — added a new "IT Response Agent" card (rose accent, `Bot` icon from lucide-react) linking to `/response-agent`. Card includes `<span id="ai-review-badge">` for the live pending-review count. Below the grid, a `next/script` element loads `${IT_RESPONSE_AGENT_URL}/embed.js` with `data-api-url`, `data-api-key`, and `data-poll-interval="30"` attributes (only rendered when both env vars are present). The badge uses Tailwind's `empty:hidden` so it's invisible until embed.js writes a count into it.
- `components/AppHeader.tsx` — added a "Response Agent" nav item (using `Bot` icon) between "Sync" and "Settings".
- `lib/env.ts` — added `IT_RESPONSE_AGENT_URL` and `IT_RESPONSE_AGENT_API_KEY` to `requiredServerVars` so `validateEnv()` fails fast at startup if they're missing.
- `tests/lib/env.test.ts` — extended the test's `requiredVars` list to match `lib/env.ts` (also picked up the previously-missing `NEXTAUTH_SECRET` from Phase 9 so the suite stays in sync).

### Decisions / deviations
- **Security trade-off (accepted, documented):** the API key is rendered into the client HTML in two places — the iframe `src` query string and the `data-api-key` attribute on `embed.js`. This is unavoidable with the iframe + embed.js integration pattern documented by the IT Response Agent. The "Future Considerations" section already calls out that a per-user Azure AD session would be the proper long-term fix.
- **Env var names** kept exactly as planned (no `NEXT_PUBLIC_` prefix needed): the dashboard and response-agent pages are both Server Components, so they read `process.env.*` server-side and inline the values into the rendered HTML.
- **Iframe height**: used `min-h-[calc(100vh-105px)]` (≈ AppHeader 56px + back-nav bar 49px) inside a `flex flex-col` page so the iframe always fills the viewport without scrollbars stacking.
- **Auth**: no middleware change needed. The existing matcher in `middleware.ts` protects everything that isn't `/login`, `/api/auth`, the sync cron routes, or static assets, so `/response-agent` is automatically gated by NextAuth.
- **Build verification**: `npm run build` exits 0 with `/response-agent` listed as a dynamic route (178 B First-Load JS delta). The dynamic-server-usage warnings that appear during static page generation are pre-existing (originate from `/api/devices`, `/api/employees`, `/api/software`, `/api/licenses`, `/api/sync/logs`) and unrelated to this phase.

### Outstanding deployment-time tasks (not code)
- Set `IT_RESPONSE_AGENT_URL` and `IT_RESPONSE_AGENT_API_KEY` on each environment (local `.env.local` plus whatever production environment Phase 20 ultimately picks).
- Set `PORTAL_ORIGIN` on the IT Response Agent server to the prod EMS origin (TBD via Phase 20) plus `http://localhost:3000` for dev so CORS + iframe embedding work.

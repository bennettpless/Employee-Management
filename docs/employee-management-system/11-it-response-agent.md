# Phase 11: IT Response Agent Integration

## Status: ⬜ Pending

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
- [ ] Create `app/response-agent/page.tsx` — IT Response Agent review dashboard
  - Embeds `review.html` via iframe: `{IT_RESPONSE_AGENT_URL}/review.html?key={IT_RESPONSE_AGENT_API_KEY}`
  - Full-height iframe with no border (`width: 100%; height: 100vh; border: none`)
  - Page title and back navigation consistent with other pages
  - Auth-protected (Phase 9 middleware handles this)

### Dashboard Integration
- [ ] Update `app/page.tsx` — add "IT Response Agent" card to the dashboard grid
  - New card with appropriate icon (e.g., `MessageSquare` or `Bot` from lucide-react)
  - Links to `/response-agent`
  - Include notification badge showing pending review count
- [ ] Add notification badge using the agent's `embed.js` script
  - Script src: `{IT_RESPONSE_AGENT_URL}/embed.js`
  - Attributes: `data-api-url`, `data-api-key`, `data-poll-interval="30"`
  - Badge element: `<span id="ai-review-badge">` styled next to the card

### Environment Configuration
- [ ] Update `lib/env.ts` — add required env vars:
  - `IT_RESPONSE_AGENT_URL` — base URL of the IT Response Agent server
  - `IT_RESPONSE_AGENT_API_KEY` — API key for server-to-server access

### IT Response Agent Server Configuration
- [ ] Set `PORTAL_ORIGIN` on the IT Response Agent deployment
  - Value: the Employee Management app's origin (e.g., `https://employee-management.vercel.app`)
  - This allows the iframe to load and `embed.js` to make cross-origin requests
  - Multiple origins can be comma-separated

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
[To be added during implementation]

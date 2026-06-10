# Phase 20: Production Deployment

## Status: ⏸️ On Hold — deployment direction undecided

> **⚠️ Decision required before this phase can resume.**
>
> The deployment direction for EMS is **not yet committed**. We are evaluating
> whether to host this on a **cloud provider** (Azure App Service, Vercel,
> Cloudflare, or similar) versus running it **on our own infrastructure**
> (the self-hosted spare-desktop + Caddy + NinjaOne plan documented below).
>
> This file currently captures **one option in detail** (the self-hosted plan,
> because it was the most operator-feasible at the time of writing). It is
> **not a committed direction** — the steps in §20a–20k below should not be
> executed until we have explicitly agreed on a hosting model. If we choose
> a cloud route, this doc gets either rewritten in place or split into
> `20a-self-hosted.md` / `20b-cloud.md` and the chosen option is implemented.
>
> Until that decision is made:
> - The repo's deleted `vercel.json`, the new `scripts/` directory, and the
>   self-hosted-flavored edits to `README.md` / `SETUP_GUIDE.md` /
>   `middleware.ts` / `.env.example` are **scaffolding for the self-hosted
>   option only**, kept in-repo so we don't lose the work if we pick that
>   route.
> - Phases 12–19 (the v2 Network feature) are **not blocked** by Phase 20 —
>   all v2 work continues against `npm run dev` on a developer machine and
>   ships into whichever hosting model we eventually pick.
> - The **nightly NinjaOne sync** is currently broken in production (the
>   Vercel cron is gone with `vercel.json`, and no replacement runs yet).
>   This is acceptable because there is no production environment to run
>   it against until Phase 20 lands.

## Overview (self-hosted option, kept for reference)

The plan below describes **one** of the candidate deployment models —
running EMS on a **spare Windows desktop on the Bennett & Pless office LAN**,
fronted by **Caddy** (auto-HTTPS reverse proxy) and made accessible to all
employees via **NinjaOne**-pushed root CA cert + `hosts` file entry. Users
would browse to `https://ems.local` from any office machine. No cloud
hosting fees, no DNS-team involvement, no per-user manual setup.

### Why this option is documented in detail

When this plan was originally written, the cloud options below were each
deemed blocked or impractical for an immediate deployment:

- **Vercel** — Hobby tier explicitly prohibits commercial use, and Pro
  tier costs ~$20/user/month. Bennett & Pless is a commercial entity, so
  Hobby is off the table.
- **Azure App Service** — would require either a confirmed Azure
  subscription with billing (no one had one available) or a paid B1 tier
  (~$13/mo). Rejected against a hard "$0 today" constraint at the time.
- **Cloudflare Tunnel + a subdomain of `ben-net.tech` or `bennett-pless.com`** —
  would be ideal (real public URL, real cert, zero per-user setup) but
  requires one DNS record from whoever has admin access to AWS Route 53
  (for `ben-net.tech`) or to Bennett & Pless's `bennett-pless.com` DNS.
  Operator did not currently have that access.

The self-hosted plan was attractive because it's genuinely free, uses
existing assets (a spare desktop + already-paid-for NinjaOne RMM), and
can be stood up end-to-end in ~60 minutes without external approvals.

**However** — those constraints may have changed (e.g. an Azure
subscription becomes available, DNS access is granted, or the team
decides $13/mo is fine), in which case a cloud route is likely the
better long-term choice (no per-machine cert/hosts management, real
public URL, no dependency on the office LAN being healthy). **That
decision is what's currently pending.**

### What users see

- They open a browser at the office (or via VPN) and go to `https://ems.local`
- They sign in with their `@bennett-pless.com` / `@bpl-enclosure.com` Microsoft account (existing Azure AD SSO)
- The site looks like a real HTTPS site — no cert warnings, no scary "Not Secure" indicator — because their Windows machine has been enrolled into trusting the Caddy root CA via NinjaOne

## Prerequisites

- ✅ Phase 9 complete (Azure AD SSO, existing App Registration the operator can edit)
- ✅ Phase 11 complete (IT Response Agent integration; we ship the env vars to prod)
- ✅ Spare Windows desktop, powered on, with full Administrator access
- ✅ Desktop has outbound internet (for Supabase, NinjaOne, Microsoft Graph, NextAuth provider discovery)
- ✅ Desktop is on the office LAN with a routable internal IP
- ✅ NinjaOne admin access (to push the cert + hosts entry to all employee machines)
- ✅ Operator can edit the existing EMS Azure AD App Registration (add new redirect URI)
- ⏳ Bennett (IT Response Agent owner) updates `PORTAL_ORIGIN` once we send him the prod URL

## Open Decisions

| # | Decision | Default | Chosen |
|---|---|---|---|
| 1 | Hostname | `ems.local` | **`ems.local`** |
| 2 | Static IP for desktop | Yes (DHCP reservation from IT, or set manually) | Pending — need to set this on the desktop before NinjaOne push |
| 3 | App install path | `C:\apps\ems` | Default |
| 4 | Caddy install path | `C:\caddy` | Default |
| 5 | Run as Windows Service | Yes, via NSSM | Default |
| 6 | Cron strategy | GitHub Actions scheduled workflow (free, in the same repo) hitting the prod `/api/sync/ninjaone` endpoint with `SYNC_CRON_SECRET` | Default |
| 7 | Backup strategy | None initially (the app is stateless; data lives in Supabase). If the desktop dies, redeploy on another machine in ~30 min. | Default; revisit if uptime becomes critical |

## Planned Changes

### 20a. Prepare the spare desktop

- [ ] Get the desktop a stable internal IP — either a DHCP reservation from IT or set a static IP on the desktop's NIC (record the IP for step 20e; e.g., `192.168.1.42`)
- [ ] Confirm the desktop won't auto-sleep: **Control Panel → Power Options → "Never" for "Put the computer to sleep"** on both AC and battery
- [ ] Confirm Windows Update doesn't auto-restart during work hours: **Settings → Windows Update → Advanced options → set active hours to 06:00–20:00**
- [ ] Create a local Windows admin account for the app (e.g., `ems-svc`) — NOT strictly required but cleaner than running services under your personal account

### 20b. Install runtime software on the desktop

- [ ] Install **Git for Windows** — <https://git-scm.com/download/win>
- [ ] Install **Node.js 20 LTS** (Windows MSI) — <https://nodejs.org/en/download>
- [ ] Install **Caddy** — single binary download from <https://caddyserver.com/download> (select Windows amd64, no plugins needed). Place at `C:\caddy\caddy.exe`.
- [ ] Install **NSSM** (Non-Sucking Service Manager) — <https://nssm.cc/download>. Extract `nssm.exe` to `C:\nssm\nssm.exe`. Used to register Node + Caddy as Windows Services so they survive reboots.
- [ ] Verify installs by opening a new PowerShell as Administrator and running:
  ```powershell
  git --version
  node --version    # should print v20.x.x
  npm --version
  C:\caddy\caddy.exe version
  C:\nssm\nssm.exe  # prints usage banner
  ```

### 20c. Clone and configure the app

- [ ] `git clone https://github.com/bennettpless/Employee-Management.git C:\apps\ems`
- [ ] `cd C:\apps\ems`
- [ ] `npm ci` (uses lockfile; faster + more reproducible than `npm install`)
- [ ] Create `C:\apps\ems\.env.local` with all 14+ env vars (see Appendix A for the template)
- [ ] `npm run build` — produces the optimized `.next/` production bundle
- [ ] Smoke test locally on the desktop: `npm start` → open `http://localhost:3000` from the desktop itself → see the login page → Ctrl+C to stop

### 20d. Configure Caddy as the HTTPS reverse proxy

- [ ] Create `C:\caddy\Caddyfile` with this content:
  ```caddyfile
  {
      auto_https disable_redirects
  }

  ems.local {
      tls internal
      reverse_proxy localhost:3000
      encode gzip
  }
  ```
- [ ] First-run Caddy to generate its local CA + cert: `C:\caddy\caddy.exe run --config C:\caddy\Caddyfile`
  - Wait until it prints `serving initial configuration` then Ctrl+C
  - The root CA cert is now at `%LocalAppData%\Caddy\pki\authorities\local\root.crt` (current-user run) or `%ProgramData%\Caddy\pki\authorities\local\root.crt` (service run, see next step)
- [ ] Note that Caddy auto-generates a leaf cert for `ems.local` signed by its own root CA. Any machine that trusts the root CA will trust the leaf cert without warnings.

### 20e. Run Node and Caddy as Windows Services

NSSM commands (run as Administrator):

- [ ] **Node.js (Next.js production server):**
  ```powershell
  C:\nssm\nssm.exe install ems-app "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" "start"
  C:\nssm\nssm.exe set ems-app AppDirectory "C:\apps\ems"
  C:\nssm\nssm.exe set ems-app AppStdout "C:\apps\ems\logs\app.out.log"
  C:\nssm\nssm.exe set ems-app AppStderr "C:\apps\ems\logs\app.err.log"
  C:\nssm\nssm.exe set ems-app AppEnvironmentExtra "NODE_ENV=production" "PORT=3000"
  C:\nssm\nssm.exe set ems-app Start SERVICE_AUTO_START
  mkdir C:\apps\ems\logs
  C:\nssm\nssm.exe start ems-app
  ```
- [ ] **Caddy:**
  ```powershell
  C:\nssm\nssm.exe install ems-caddy "C:\caddy\caddy.exe" "run" "--config" "C:\caddy\Caddyfile"
  C:\nssm\nssm.exe set ems-caddy AppDirectory "C:\caddy"
  C:\nssm\nssm.exe set ems-caddy AppStdout "C:\caddy\caddy.out.log"
  C:\nssm\nssm.exe set ems-caddy AppStderr "C:\caddy\caddy.err.log"
  C:\nssm\nssm.exe set ems-caddy Start SERVICE_AUTO_START
  C:\nssm\nssm.exe start ems-caddy
  ```
- [ ] Verify both services are running: `Get-Service ems-app, ems-caddy`
- [ ] Verify locally on the desktop: `Invoke-WebRequest -Uri https://localhost -SkipCertificateCheck -Headers @{Host='ems.local'}` returns 200

### 20f. Push the Caddy root CA + hosts entry to all employee machines via NinjaOne

See Appendix B for the full PowerShell scripts. Two NinjaOne policies needed:

- [ ] **Policy 1 — Install Caddy Root CA:** copies `caddy-root.crt` (uploaded as a NinjaOne attachment) into the Local Machine Trusted Root Certification Authorities store. Runs once per machine, idempotent.
- [ ] **Policy 2 — Add `ems.local` hosts entry:** appends `<DESKTOP_IP>  ems.local` to `%windir%\System32\drivers\etc\hosts`. Idempotent (won't add duplicate lines).
- [ ] Scope both policies to the device group containing all `@bennett-pless.com` / `@bpl-enclosure.com` employee machines.
- [ ] Wait for next NinjaOne check-in cycle (typically 5-15 minutes per machine).

### 20g. Update Azure AD App Registration

- [ ] Entra ID → App registrations → the EMS app (Client ID matches `AZURE_CLIENT_ID`)
- [ ] **Authentication → Redirect URIs → Add web URI**: `https://ems.local/api/auth/callback/azure-ad`
- [ ] **Front-channel logout URL**: `https://ems.local/api/auth/signout`
- [ ] Leave `http://localhost:3000/api/auth/callback/azure-ad` in the list — still needed for dev
- [ ] Save

### 20h. Set up GitHub Actions cron for nightly NinjaOne sync

The current `vercel.json` cron is dead (no Vercel project). Replacement: a GitHub Actions scheduled workflow hits the EMS endpoint over the internal-only LAN.

**Catch:** GitHub Actions runs from GitHub's cloud, which can't reach `https://ems.local` on Bennett & Pless's LAN. So the cron strategy here is different:

- [ ] **Option A (recommended):** create a **second NinjaOne scheduled task** that runs on the spare desktop itself at 03:00 daily and POSTs to `https://localhost/api/sync/ninjaone` with the `SYNC_CRON_SECRET` header. Avoids egress entirely. See Appendix C for the script.
- [ ] **Option B:** install **Windows Task Scheduler** task on the desktop that does the same thing as Option A — no NinjaOne dependency.

Going with **Option B** (Task Scheduler) by default since it's simpler and lives on the same machine as the app.

- [ ] Create `C:\apps\ems\scripts\nightly-ninja-sync.ps1` (see Appendix C)
- [ ] Register Task Scheduler task: `schtasks /create /tn "EMS Nightly NinjaOne Sync" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\apps\ems\scripts\nightly-ninja-sync.ps1" /sc daily /st 03:00 /ru SYSTEM`
- [ ] Verify task is registered: `schtasks /query /tn "EMS Nightly NinjaOne Sync"`
- [ ] Manually trigger once to confirm: `schtasks /run /tn "EMS Nightly NinjaOne Sync"`, then check `/sync` page in the app

### 20i. Send Bennett the PORTAL_ORIGIN update

- [ ] Send the message in Appendix D to Bennett (IT Response Agent owner)
- [ ] After Bennett restarts the agent, hard-refresh `https://ems.local` and verify the dashboard badge populates with the pending count within ~30s of page load

### 20j. Smoke test (production)

From any employee machine that's received the NinjaOne push:

- [ ] `https://ems.local` → EMS login page loads (no cert warning) — **green padlock confirms cert trust worked**
- [ ] Click "Sign in with Microsoft" → Microsoft login → land on `/` dashboard with a session
- [ ] Dashboard shows all cards including the new IT Response Agent card
- [ ] `/employees`, `/devices`, `/sync`, `/response-agent` all load
- [ ] `/response-agent` iframe loads the agent's `review.html` (only after Bennett updates `PORTAL_ORIGIN`)
- [ ] Manually trigger NinjaOne sync from `/sync` page — completes successfully
- [ ] Restart the spare desktop — services come back up automatically, app is reachable again within ~60s

### 20k. Clean up Vercel + dev-only artifacts

- [ ] Delete `vercel.json` from the repo (cron is now Task Scheduler-driven on the desktop)
- [ ] Remove the Vercel-specific comment in `middleware.ts` about cron routes
- [ ] Update `SETUP_GUIDE.md` "Deployment" section to point at this Phase 20 doc instead of Vercel
- [ ] Update `00-index.md`: change `"Vercel cron — to be replaced by Azure Function TimerTrigger"` decision to `"Self-hosted; nightly sync runs via Windows Task Scheduler on the production desktop"`
- [ ] Update `.env.example` comment on `NEXTAUTH_URL` — replace "Vercel auto-detects" with "Set explicitly when self-hosting; for ems.local use `https://ems.local`"

## Key Files

### New
- `docs/employee-management-system/20-production-deployment.md` (this file)
- `scripts/deploy-desktop/` (Windows-side setup helpers — Caddy config template, NSSM install helper, root CA export helper)
- `scripts/ninja-policies/install-caddy-root-ca.ps1` (NinjaOne Policy 1)
- `scripts/ninja-policies/add-ems-local-hosts-entry.ps1` (NinjaOne Policy 2)
- `scripts/cron/nightly-ninja-sync.ps1` (Task Scheduler cron script)

### Modified
- `vercel.json` — **deleted** in 20k
- `SETUP_GUIDE.md` — Deployment section rewritten for self-host approach
- `docs/employee-management-system/00-index.md` — Phase 20 marked In Progress, then Complete; "Vercel cron" decision updated
- `middleware.ts` — comment on cron route exclusion updated
- `.env.example` — `NEXTAUTH_URL` comment updated

## Integration Pattern

```
Office LAN (192.168.x.x/24)
│
├── Spare Desktop (192.168.x.42)
│   ├── ems-app  (Windows Service, NSSM-wrapped)
│   │   └── node node_modules/next/dist/bin/next start  ← listens on :3000
│   ├── ems-caddy  (Windows Service, NSSM-wrapped)
│   │   └── caddy run  ← listens on :443
│   │       ├── TLS cert from local Caddy CA (auto-renewed)
│   │       └── reverse_proxy → http://localhost:3000
│   └── Task Scheduler: "EMS Nightly NinjaOne Sync" @ 03:00 daily
│       └── POST https://localhost/api/sync/ninjaone (Bearer SYNC_CRON_SECRET)
│
└── Employee Machines (~10 total)
    ├── NinjaOne Policy: Caddy Root CA → Trusted Root store
    ├── NinjaOne Policy: hosts entry "192.168.x.42  ems.local"
    └── Browse to https://ems.local → green padlock → Microsoft SSO → EMS

External (over internet, called from the desktop):
├── Supabase (DB queries)
├── Microsoft Graph (Azure AD SSO + user info)
├── NinjaOne API (device sync)
└── IT Response Agent (app-itticketagent-api-prod.azurewebsites.net)
    └── must add https://ems.local to its PORTAL_ORIGIN allowlist (Bennett's ask)
```

## Future Considerations

- **Phase 20.1 — Move to a real domain** (e.g., `ems.bennett-pless.com` or `ems.ben-net.tech`): once DNS access is sorted, swap the Caddy config from `tls internal` + local hostname to `tls` with auto-Let's-Encrypt + the public domain. Eliminates the NinjaOne cert/hosts dependency entirely. ~30 min of work once DNS is in place.
- **Phase 20.2 — Cloudflare Tunnel migration**: instead of running on the LAN with hosts-file resolution, run the same desktop behind a Cloudflare Tunnel + the public domain from 20.1. Lets remote users (working from home, traveling) reach EMS without VPN. Still $0 with a Cloudflare free account.
- **Phase 20.3 — Real server (Azure or otherwise)**: when the team grows past ~30 users or the spare desktop becomes an availability concern, migrate to a proper App Service / Container Apps deployment. The old "Azure App Service" plan is preserved in Git history (`git log -- docs/employee-management-system/20-production-deployment.md`).
- **Phase 20.4 — UPS for the spare desktop**: cheap insurance against power blips taking the app offline.
- **Backups of the desktop's drive**: low priority since the app is stateless (all data in Supabase), but a periodic snapshot of `C:\apps\ems\.env.local` would prevent a "lost the secrets" recovery scenario.
- **Application Insights / log aggregation**: NSSM writes logs to local files. If we want central log search, install the Azure Monitor agent or pipe logs to Loki/Grafana Cloud.

## Verification Checklist

See **20j. Smoke test** above. Mark each item complete as it's verified.

## Implementation Notes

[To be added during execution.]

---

## Appendix A — `.env.local` template for the spare desktop

Copy this into `C:\apps\ems\.env.local`. Replace each `<...>` with the real value (the operator already has all of these in their local dev `.env.local`).

```bash
NEXTAUTH_URL=https://ems.local
NEXTAUTH_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" for a NEW prod-specific value>

AZURE_CLIENT_ID=<same as dev>
AZURE_CLIENT_SECRET=<same as dev>
AZURE_TENANT_ID=<same as dev>

NEXT_PUBLIC_SUPABASE_URL=<same as dev>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same as dev>
SUPABASE_SERVICE_ROLE_KEY=<same as dev>

SHAREPOINT_SITE_PATH=<same as dev>
SHAREPOINT_FILE_PATH=<same as dev>

NINJA_CLIENT_ID=<same as dev>
NINJA_CLIENT_SECRET=<same as dev>
NINJA_REGION=us

IT_RESPONSE_AGENT_URL=https://app-itticketagent-api-prod.azurewebsites.net
IT_RESPONSE_AGENT_API_KEY=<same as dev — shared agent>

SYNC_CRON_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" for a NEW prod-specific value>
```

> **Important:** generate new prod-specific values for `NEXTAUTH_SECRET` and `SYNC_CRON_SECRET`. **Do not reuse the dev values** — if the dev `.env.local` ever leaks, prod is still protected.

## Appendix B — NinjaOne PowerShell policy scripts

### Policy 1 — Install Caddy Root CA

Upload `caddy-root.crt` (the file from `%ProgramData%\Caddy\pki\authorities\local\root.crt` on the spare desktop) as a NinjaOne attachment named `caddy-root.crt`. Then this script as the policy:

```powershell
# install-caddy-root-ca.ps1
# Idempotent: skips install if cert with matching thumbprint is already in the store.

$CertPath = Join-Path $env:TEMP 'caddy-root.crt'

# NinjaOne provides downloaded attachments at $ninjaAttachmentPath or similar.
# Adjust to wherever your NinjaOne agent delivers attachments to.
Copy-Item -Path "$PSScriptRoot\caddy-root.crt" -Destination $CertPath -Force

$cert = Get-PfxCertificate -FilePath $CertPath
$thumb = $cert.Thumbprint

$exists = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $thumb }
if ($exists) {
  Write-Output "Caddy root CA already trusted (thumbprint $thumb). Skipping."
  exit 0
}

Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
Write-Output "Installed Caddy root CA (thumbprint $thumb) to LocalMachine\Root."

Remove-Item $CertPath -Force
exit 0
```

### Policy 2 — Add `ems.local` hosts entry

Replace `192.168.1.42` with the actual static IP of the spare desktop.

```powershell
# add-ems-local-hosts-entry.ps1
# Idempotent: skips if entry already present.

$HostsPath = "$env:windir\System32\drivers\etc\hosts"
$Entry = "192.168.1.42  ems.local"
$Marker = "# Managed by EMS deployment policy"

$content = Get-Content -Path $HostsPath -Raw -ErrorAction Stop

if ($content -match [regex]::Escape("ems.local")) {
  Write-Output "ems.local entry already present in hosts file. Skipping."
  exit 0
}

$newContent = $content.TrimEnd() + "`r`n`r`n$Marker`r`n$Entry`r`n"
Set-Content -Path $HostsPath -Value $newContent -Encoding ASCII -Force
Write-Output "Added '$Entry' to $HostsPath."

# Flush DNS so the new mapping takes effect immediately
ipconfig /flushdns | Out-Null
exit 0
```

## Appendix C — Nightly NinjaOne sync (Task Scheduler script)

```powershell
# C:\apps\ems\scripts\nightly-ninja-sync.ps1
# Runs daily at 03:00 via Task Scheduler. Posts to the local EMS sync endpoint.

$ErrorActionPreference = 'Stop'
$LogPath = 'C:\apps\ems\logs\nightly-sync.log'

function Write-Log($msg) {
  $ts = Get-Date -Format 's'
  Add-Content -Path $LogPath -Value "$ts  $msg"
}

# Load SYNC_CRON_SECRET from .env.local so it's not duplicated.
$envFile = 'C:\apps\ems\.env.local'
$secret = (Select-String -Path $envFile -Pattern '^SYNC_CRON_SECRET=' | Select-Object -First 1).Line -replace '^SYNC_CRON_SECRET=', ''
if (-not $secret) {
  Write-Log "ERROR: SYNC_CRON_SECRET not found in $envFile"
  exit 1
}

try {
  Write-Log "Starting nightly NinjaOne sync."
  # Bypass cert check for localhost-to-localhost call (the cert is for ems.local, not localhost)
  $r = Invoke-WebRequest `
    -Uri 'https://localhost/api/sync/ninjaone' `
    -Method POST `
    -Headers @{ Authorization = "Bearer $secret"; Host = 'ems.local' } `
    -SkipCertificateCheck `
    -UseBasicParsing `
    -TimeoutSec 600
  Write-Log "Sync returned HTTP $($r.StatusCode)."
  exit 0
} catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
}
```

> `-SkipCertificateCheck` is acceptable here because the call is **strictly localhost-to-localhost on the same machine** — no MITM surface.

## Appendix D — Message for Bennett (PORTAL_ORIGIN update)

Send this once `https://ems.local` is live and smoke-tested:

> Hey Bennett — quick follow-up on the IT Response Agent integration.
>
> Our Employee Management System is now deployed internally at **`https://ems.local`** (self-hosted on a spare desktop on our LAN, reachable by all `@bennett-pless.com` employees on the office network). For the agent's badge + iframe embed to load on our dashboard without CORS errors, we need you to add the EMS origin to the `PORTAL_ORIGIN` env var on the agent's App Service (`app-itticketagent-api-prod`).
>
> Specifically, please set:
>
> ```
> PORTAL_ORIGIN=https://ems.local,http://localhost:3000
> ```
>
> (Comma-separated list — `https://ems.local` is the production origin; `http://localhost:3000` is for our local dev. If the agent's CORS code only accepts a single value, just use `https://ems.local` — we can hardcode dev separately.)
>
> After saving, please restart the App Service so the new value applies. Should take effect immediately.
>
> Thanks!

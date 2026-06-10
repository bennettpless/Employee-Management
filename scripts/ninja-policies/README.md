# NinjaOne Deployment Policies for EMS

Two PowerShell scripts to be deployed as NinjaOne **Custom Scripts** (run as SYSTEM) to every employee machine that needs to access the Employee Management System.

## Why these are needed

The EMS app is hosted internally at `https://ems.local` on a spare desktop. For each employee machine to reach it without certificate warnings or "DNS not found" errors, two one-time things must be configured per machine:

1. **Trust the Caddy local root CA** so the HTTPS cert for `ems.local` shows a green padlock.
2. **Resolve `ems.local`** to the spare desktop's internal IP via the local hosts file.

Both are idempotent — safe to re-run on machines that already have them.

## Setup steps

### Policy 1 — Install Caddy Root CA

1. On the spare desktop, run `scripts\deploy-desktop\export-root-ca.ps1` to copy the Caddy root cert to your Desktop as `caddy-root.crt`.
2. In NinjaOne, create a new **Script** (PowerShell, Windows).
3. Paste the contents of `install-caddy-root-ca.ps1`.
4. Upload `caddy-root.crt` as a **script attachment**.
5. Create a **Policy** that runs this script on a schedule (e.g., daily) — idempotent, so a daily re-run just verifies nothing changed.
6. Scope the policy to your "All Employees" device group.

### Policy 2 — Add ems.local Hosts Entry

1. **Edit `add-ems-local-hosts-entry.ps1`** and update `$DesktopIp` from the placeholder `'192.168.1.42'` to the actual static IP of your spare desktop.
2. In NinjaOne, create another **Script** (PowerShell, Windows).
3. Paste the updated contents.
4. (No attachments needed.)
5. Create a **Policy** that runs this script on the same daily schedule.
6. Scope the policy to the same device group.

### Verification

After both policies have propagated to a test machine (typically within one NinjaOne check-in cycle, ~15 minutes):

```powershell
# On the employee machine:
nslookup ems.local
# → should return the spare desktop's internal IP

Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*Caddy Local Authority*" }
# → should return the imported cert

Invoke-WebRequest -Uri https://ems.local -UseBasicParsing | Select-Object StatusCode
# → 200 with no cert warning
```

## When to re-run

The Caddy root CA is valid for ~10 years by default, so a one-time push is sufficient. However, **if you ever rebuild the spare desktop from scratch**, Caddy will generate a brand new root CA — at that point you must:

1. Re-export the new `caddy-root.crt` via `export-root-ca.ps1`
2. Re-upload it as the attachment on Policy 1
3. Trigger the policy to push out the new cert to all machines

(The old cert will still be in their stores; it just won't match what the desktop is serving. The new cert installs alongside the old one, no removal needed.)

If the desktop's IP changes, update `$DesktopIp` in Policy 2 and re-deploy.

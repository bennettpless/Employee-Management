# Self-Hosted Deployment Scripts

Helper scripts for **Phase 20** — deploying EMS on a spare Windows desktop with Caddy + NinjaOne-pushed certificate. See [`docs/employee-management-system/20-production-deployment.md`](../docs/employee-management-system/20-production-deployment.md) for the full runbook this folder supports.

## Layout

```
scripts/
├── deploy-desktop/           Run ON the spare desktop during initial setup
│   ├── Caddyfile             Drop-in Caddy config (HTTPS reverse proxy for ems.local)
│   ├── install-services.ps1  Registers ems-app + ems-caddy as Windows Services via NSSM
│   └── export-root-ca.ps1    Copies Caddy's auto-generated root CA out for NinjaOne upload
├── ninja-policies/           Run from NinjaOne, pushed to all employee machines
│   ├── install-caddy-root-ca.ps1  Trusts the Caddy root CA on each machine
│   └── add-ems-local-hosts-entry.ps1  Adds `<DESKTOP_IP>  ems.local` to hosts
└── cron/                     Run ON the spare desktop via Windows Task Scheduler
    ├── nightly-ninja-sync.ps1  Hits /api/sync/ninjaone with SYNC_CRON_SECRET nightly
    └── install-task.ps1        Registers the Task Scheduler job
```

## Quick start (high-level)

1. Set up the desktop (see Phase 20 doc §20a–20c)
2. From `C:\apps\ems`: `Copy-Item scripts\deploy-desktop\Caddyfile C:\caddy\Caddyfile`
3. Run Caddy once to generate the root CA, then `scripts\deploy-desktop\install-services.ps1`
4. Run `scripts\deploy-desktop\export-root-ca.ps1` to get `caddy-root.crt` for NinjaOne upload
5. Push the two NinjaOne policies to all employee machines
6. Run `scripts\cron\install-task.ps1` to register the nightly sync

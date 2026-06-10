# install-services.ps1
# Run as Administrator on the spare desktop.
# Registers ems-app (Next.js) and ems-caddy (HTTPS reverse proxy) as Windows Services via NSSM.
#
# Prerequisites:
#   - Node.js 20 LTS installed at "C:\Program Files\nodejs\"
#   - Caddy installed at C:\caddy\caddy.exe with C:\caddy\Caddyfile in place
#   - NSSM installed at C:\nssm\nssm.exe
#   - Repo cloned to C:\apps\ems
#   - C:\apps\ems\.env.local populated with real secrets
#   - `npm ci` and `npm run build` already completed in C:\apps\ems

[CmdletBinding()]
param(
    [string] $AppPath = 'C:\apps\ems',
    [string] $NodePath = 'C:\Program Files\nodejs\node.exe',
    [string] $CaddyPath = 'C:\caddy\caddy.exe',
    [string] $CaddyConfig = 'C:\caddy\Caddyfile',
    [string] $NssmPath = 'C:\nssm\nssm.exe',
    [int]    $Port = 3000
)

$ErrorActionPreference = 'Stop'

function Require-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Must be run as Administrator.'
    }
}

function Test-PathOrThrow {
    param([string] $Path, [string] $What)
    if (-not (Test-Path $Path)) { throw "$What not found at: $Path" }
}

Require-Admin
Test-PathOrThrow $NodePath    'Node.js'
Test-PathOrThrow $CaddyPath   'Caddy binary'
Test-PathOrThrow $CaddyConfig 'Caddyfile'
Test-PathOrThrow $NssmPath    'NSSM'
Test-PathOrThrow $AppPath     'App directory'
Test-PathOrThrow (Join-Path $AppPath '.env.local') 'C:\apps\ems\.env.local'
Test-PathOrThrow (Join-Path $AppPath '.next')     'C:\apps\ems\.next (run `npm run build` first)'

$LogDir = Join-Path $AppPath 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Remove-ExistingService {
    param([string] $Name)
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Stopping and removing existing service '$Name'..."
        & $NssmPath stop $Name | Out-Null
        Start-Sleep -Seconds 2
        & $NssmPath remove $Name confirm | Out-Null
    }
}

# ─── ems-app (Next.js production server) ─────────────────────────────────────
Remove-ExistingService 'ems-app'
$nextBin = Join-Path $AppPath 'node_modules\next\dist\bin\next'
Test-PathOrThrow $nextBin 'next binary in node_modules (run `npm ci` first)'

& $NssmPath install 'ems-app' $NodePath "`"$nextBin`"" 'start' | Out-Null
& $NssmPath set     'ems-app' AppDirectory $AppPath | Out-Null
& $NssmPath set     'ems-app' AppStdout    (Join-Path $LogDir 'app.out.log') | Out-Null
& $NssmPath set     'ems-app' AppStderr    (Join-Path $LogDir 'app.err.log') | Out-Null
& $NssmPath set     'ems-app' AppRotateFiles 1 | Out-Null
& $NssmPath set     'ems-app' AppRotateOnline 1 | Out-Null
& $NssmPath set     'ems-app' AppRotateBytes 10485760 | Out-Null
& $NssmPath set     'ems-app' AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port" | Out-Null
& $NssmPath set     'ems-app' Start SERVICE_AUTO_START | Out-Null
& $NssmPath set     'ems-app' AppExit Default Restart | Out-Null
& $NssmPath set     'ems-app' AppRestartDelay 5000 | Out-Null
& $NssmPath start   'ems-app' | Out-Null
Write-Host "ems-app service installed and started."

# ─── ems-caddy (HTTPS reverse proxy) ──────────────────────────────────────────
Remove-ExistingService 'ems-caddy'
& $NssmPath install 'ems-caddy' $CaddyPath 'run' '--config' $CaddyConfig | Out-Null
& $NssmPath set     'ems-caddy' AppDirectory (Split-Path $CaddyPath) | Out-Null
& $NssmPath set     'ems-caddy' AppStdout    (Join-Path (Split-Path $CaddyPath) 'caddy.out.log') | Out-Null
& $NssmPath set     'ems-caddy' AppStderr    (Join-Path (Split-Path $CaddyPath) 'caddy.err.log') | Out-Null
& $NssmPath set     'ems-caddy' AppRotateFiles 1 | Out-Null
& $NssmPath set     'ems-caddy' AppRotateBytes 10485760 | Out-Null
& $NssmPath set     'ems-caddy' Start SERVICE_AUTO_START | Out-Null
& $NssmPath set     'ems-caddy' AppExit Default Restart | Out-Null
& $NssmPath set     'ems-caddy' AppRestartDelay 5000 | Out-Null
& $NssmPath start   'ems-caddy' | Out-Null
Write-Host "ems-caddy service installed and started."

Write-Host ""
Write-Host "Both services installed. Verify with:"
Write-Host "  Get-Service ems-app, ems-caddy"
Write-Host ""
Write-Host "Smoke-test locally on the desktop:"
Write-Host "  Invoke-WebRequest -Uri https://localhost -SkipCertificateCheck -Headers @{Host='ems.local'} | Select-Object StatusCode"

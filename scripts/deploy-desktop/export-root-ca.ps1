# export-root-ca.ps1
# Run on the spare desktop AFTER Caddy has run at least once (so the root CA exists).
# Copies the Caddy local root CA cert to a destination of your choice for upload to NinjaOne.

[CmdletBinding()]
param(
    [string] $Destination = "$env:USERPROFILE\Desktop\caddy-root.crt"
)

$ErrorActionPreference = 'Stop'

# Two possible locations depending on whether Caddy ran as a Windows Service (LocalSystem)
# or under your user account.
$CandidatePaths = @(
    "$env:ProgramData\Caddy\pki\authorities\local\root.crt",  # Service / LocalSystem
    "$env:LocalAppData\Caddy\pki\authorities\local\root.crt"  # Per-user run
)

$Found = $CandidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Found) {
    Write-Error @"
Caddy root CA not found. Searched:
  $($CandidatePaths -join "`n  ")

Make sure Caddy has run at least once and has issued a cert for ems.local.
(Start the ems-caddy service or run 'caddy run --config C:\caddy\Caddyfile' manually first.)
"@
    exit 1
}

Copy-Item -Path $Found -Destination $Destination -Force
Write-Host "Caddy root CA copied to: $Destination"
Write-Host ""
Write-Host "Next step: upload this file as an attachment to your NinjaOne policy"
Write-Host "(see scripts\ninja-policies\install-caddy-root-ca.ps1)."

# nightly-ninja-sync.ps1
# Triggered by Windows Task Scheduler daily at 03:00 on the spare desktop.
# Posts to the local EMS /api/sync/ninjaone endpoint to kick off the nightly device sync.
#
# Why localhost (not ems.local)?
#   - Avoids any DNS / hosts file dependency
#   - Same machine, zero MITM risk → -SkipCertificateCheck is safe
#   - Faster (no DNS lookup, no LAN round-trip)

[CmdletBinding()]
param(
    [string] $AppDir    = 'C:\apps\ems',
    [string] $Endpoint  = 'https://localhost/api/sync/ninjaone',
    [int]    $TimeoutSec = 600
)

$ErrorActionPreference = 'Stop'

$LogDir  = Join-Path $AppDir 'logs'
$LogPath = Join-Path $LogDir 'nightly-sync.log'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string] $Message, [string] $Level = 'INFO')
    $ts = Get-Date -Format 's'
    "$ts  $Level  $Message" | Add-Content -Path $LogPath
}

try {
    Write-Log "Starting nightly NinjaOne sync."

    # Load SYNC_CRON_SECRET from .env.local
    $envFile = Join-Path $AppDir '.env.local'
    if (-not (Test-Path $envFile)) {
        throw "Env file not found at $envFile"
    }

    $secretLine = Select-String -Path $envFile -Pattern '^SYNC_CRON_SECRET=' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $secretLine) {
        throw "SYNC_CRON_SECRET not found in $envFile"
    }
    $secret = ($secretLine.Line -replace '^SYNC_CRON_SECRET=', '').Trim('"', "'", ' ')
    if (-not $secret) {
        throw "SYNC_CRON_SECRET in $envFile is empty"
    }

    # PowerShell 5 doesn't support -SkipCertificateCheck. Need to disable cert validation globally for this process.
    # (Acceptable because target is localhost on the same machine.)
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        Add-Type @"
            using System.Net;
            using System.Security.Cryptography.X509Certificates;
            public class TrustAllCertsPolicy : ICertificatePolicy {
                public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) { return true; }
            }
"@
        [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        $skipCertParam = @{}
    } else {
        $skipCertParam = @{ SkipCertificateCheck = $true }
    }

    $headers = @{
        Authorization = "Bearer $secret"
        Host          = 'ems.local'
    }

    $r = Invoke-WebRequest @skipCertParam `
        -Uri $Endpoint `
        -Method POST `
        -Headers $headers `
        -UseBasicParsing `
        -TimeoutSec $TimeoutSec

    Write-Log "Sync completed. HTTP $($r.StatusCode). Body length: $($r.Content.Length)"
    exit 0
}
catch {
    Write-Log "FAILED: $($_.Exception.Message)" 'ERROR'
    if ($_.Exception.Response) {
        Write-Log "Response status: $([int]$_.Exception.Response.StatusCode)" 'ERROR'
    }
    exit 1
}

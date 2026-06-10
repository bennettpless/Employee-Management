# add-ems-local-hosts-entry.ps1
# Push this as a NinjaOne Custom Script (PowerShell, runs as SYSTEM).
# Idempotent: skips if 'ems.local' is already in the hosts file.
#
# IMPORTANT: Update $DesktopIp below to match the actual static IP of the EMS spare desktop
# BEFORE deploying this policy in NinjaOne.

[CmdletBinding()]
param(
    # IP of the spare desktop running the EMS app. UPDATE THIS before deploying.
    [string] $DesktopIp = '192.168.1.42',

    [string] $HostName = 'ems.local'
)

$ErrorActionPreference = 'Stop'

$HostsPath = "$env:windir\System32\drivers\etc\hosts"
if (-not (Test-Path $HostsPath)) {
    Write-Error "Hosts file not found at $HostsPath"
    exit 2
}

$Marker = '# Managed by EMS deployment policy (Phase 20)'
$Entry  = "{0}`t{1}" -f $DesktopIp, $HostName

$content = Get-Content -Path $HostsPath -Raw -ErrorAction Stop

# If the hostname already exists in the hosts file (any IP), skip — assume manual override is intentional.
if ($content -match "(?m)^\s*[^#].*\s$([regex]::Escape($HostName))(\s|$)") {
    Write-Output "OK: '$HostName' already present in hosts file. Skipping."
    exit 0
}

# Append our block.
$newContent = $content.TrimEnd() + "`r`n`r`n$Marker`r`n$Entry`r`n"
Set-Content -Path $HostsPath -Value $newContent -Encoding ASCII -Force

# Flush DNS cache so the change takes effect immediately for any new connections.
ipconfig /flushdns | Out-Null

Write-Output "INSTALLED: Added '$Entry' to $HostsPath."
Write-Output "DNS cache flushed."
exit 0

# install-caddy-root-ca.ps1
# Push this as a NinjaOne Custom Script (PowerShell, runs as SYSTEM).
# Idempotent: skips install if the cert is already in the LocalMachine Trusted Root store.
#
# Setup:
#   1. Upload caddy-root.crt as a NinjaOne script attachment.
#      (Get the cert by running scripts\deploy-desktop\export-root-ca.ps1 on the spare desktop.)
#   2. Save this file as the policy script.
#   3. NinjaOne delivers the attachment alongside the script; we look for it next to $PSScriptRoot.

[CmdletBinding()]
param(
    # Override only for testing — NinjaOne places attachments next to the script.
    [string] $CertFileName = 'caddy-root.crt'
)

$ErrorActionPreference = 'Stop'

$CertPath = Join-Path $PSScriptRoot $CertFileName
if (-not (Test-Path $CertPath)) {
    Write-Error "Cert file not found at $CertPath. Make sure '$CertFileName' is attached to this NinjaOne policy."
    exit 2
}

# Load cert metadata (Get-PfxCertificate works for X.509 .crt files too despite the name)
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $CertPath
$thumb = $cert.Thumbprint
$subject = $cert.Subject

$exists = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $thumb }
if ($exists) {
    Write-Output "OK: Caddy root CA already trusted on this machine."
    Write-Output "    Subject:    $subject"
    Write-Output "    Thumbprint: $thumb"
    exit 0
}

Import-Certificate -FilePath $CertPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null

Write-Output "INSTALLED: Caddy root CA added to LocalMachine Trusted Root store."
Write-Output "    Subject:    $subject"
Write-Output "    Thumbprint: $thumb"
exit 0

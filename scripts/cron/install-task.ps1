# install-task.ps1
# Run as Administrator on the spare desktop.
# Registers the nightly NinjaOne sync as a Windows Task Scheduler job.

[CmdletBinding()]
param(
    [string] $TaskName  = 'EMS Nightly NinjaOne Sync',
    [string] $ScriptPath = 'C:\apps\ems\scripts\cron\nightly-ninja-sync.ps1',
    [string] $StartTime  = '03:00'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ScriptPath)) {
    throw "Sync script not found at $ScriptPath. Make sure the repo is cloned to C:\apps\ems."
}

# Remove existing task with the same name (idempotent).
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task '$TaskName'..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action  = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime

# Run as SYSTEM so we don't need a user logged in.
$principal = New-ScheduledTaskPrincipal `
    -UserId 'SYSTEM' `
    -LogonType ServiceAccount `
    -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $trigger `
    -Principal   $principal `
    -Settings    $settings `
    -Description 'Posts to https://localhost/api/sync/ninjaone with SYNC_CRON_SECRET to refresh the device inventory from NinjaOne.' `
    | Out-Null

Write-Host "Task '$TaskName' registered to run daily at $StartTime as SYSTEM."
Write-Host ""
Write-Host "Verify with:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Select-Object TaskName, State, NextRunTime"
Write-Host ""
Write-Host "Test it now (will trigger an actual NinjaOne sync):"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-Content C:\apps\ems\logs\nightly-sync.log -Tail 20"

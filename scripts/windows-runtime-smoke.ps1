param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktopRoot = Join-Path $repoRoot "desktop"
$tauriRoot = Join-Path $desktopRoot "src-tauri"
$exePath = Join-Path $tauriRoot "target\debug\sshdeck-desktop.exe"

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-Gate {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "`n==> $Name" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
}

function Confirm-SmokeCheck {
    param([Parameter(Mandatory = $true)][string]$Text)

    while ($true) {
        $answer = (Read-Host "$Text [y/n]").Trim().ToLowerInvariant()
        if ($answer -eq "y" -or $answer -eq "yes") { return $true }
        if ($answer -eq "n" -or $answer -eq "no") { return $false }
        Write-Host "Enter y or n." -ForegroundColor Yellow
    }
}

if (-not $IsWindows) {
    throw "This runtime smoke gate must be run on Windows."
}

foreach ($command in @("cargo", "node", "npm", "ssh", "sftp")) {
    Require-Command $command
}

Write-Host "SSHDeck Windows runtime release gate" -ForegroundColor Green
Write-Host "Repository: $repoRoot"

if (-not $SkipBuild) {
    Push-Location $repoRoot
    try {
        Invoke-Gate "Rust format" { cargo fmt --all -- --check }
        Invoke-Gate "Rust Clippy" { cargo clippy --all-targets --all-features -- -D warnings }
        Invoke-Gate "Rust tests" { cargo test --all-targets --all-features }
    }
    finally {
        Pop-Location
    }

    Push-Location $desktopRoot
    try {
        Invoke-Gate "Install desktop dependencies" { npm install }
        Invoke-Gate "Workbench UI contract tests" { npm run test:ui-contracts }
        Invoke-Gate "Frontend build" { npm run build }
    }
    finally {
        Pop-Location
    }

    Push-Location $tauriRoot
    try {
        Invoke-Gate "Tauri backend tests" { cargo test }
        Invoke-Gate "Tauri backend check" { cargo check }
    }
    finally {
        Pop-Location
    }

    Push-Location $desktopRoot
    try {
        Invoke-Gate "Windows Tauri debug build" { npm run tauri -- build --debug --no-bundle }
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path $exePath)) {
    throw "Windows desktop executable not found at $exePath. Run without -SkipBuild first."
}

Write-Host "`nLaunching $exePath" -ForegroundColor Cyan
$process = Start-Process -FilePath $exePath -PassThru
Start-Sleep -Seconds 5
if ($process.HasExited) {
    throw "SSHDeck exited during startup with code $($process.ExitCode)."
}

Write-Host "`nUse a disposable/test SSH server for destructive or transfer checks." -ForegroundColor Yellow
Write-Host "The gate passes only when every item is confirmed." -ForegroundColor Yellow

$checks = @(
    "Activity Bar opens real Servers, Remote Files, Search, Ports, Sessions, History, and Settings destinations",
    "Command Palette and application/View menus open the same destinations and show unavailable commands with a reason",
    "Bottom Panel Ports, Logs, and Transfers tabs all show real content and controls",
    "No visible enabled button or menu item behaves as a no-op or opens placeholder-only content",
    "An SFTP failure is surfaced as staged diagnostics instead of a silent failure",
    "A file transfer can be queued and its cancel/retry behavior is reflected in the Transfers panel",
    "A tunnel created or changed in Ports stays synchronized with the Inspector and Bottom Panel",
    "Session selection/state stays synchronized between terminal tabs and the Sessions workspace",
    "Sidebar/panel layout restores or resets according to the Restore workspace layout setting",
    "Logs show lifecycle/diagnostic events without passwords, passphrases, tokens, Authorization values, or private-key material"
)

$failed = @()
try {
    foreach ($check in $checks) {
        if (-not (Confirm-SmokeCheck $check)) {
            $failed += $check
        }
    }
}
finally {
    Write-Host "`nClose the SSHDeck window."
    Read-Host "Press Enter after the window is closed"
    $process.Refresh()
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}

if ($failed.Count -gt 0) {
    Write-Host "`nWindows runtime smoke FAILED:" -ForegroundColor Red
    foreach ($item in $failed) {
        Write-Host " - $item" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`nWindows runtime smoke PASSED: all $($checks.Count) checks confirmed." -ForegroundColor Green
exit 0

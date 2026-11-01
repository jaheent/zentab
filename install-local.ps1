<#
.SYNOPSIS
  Local installer & tester for Zen Dual Tab Views (Bottom Dock & Cursor Switcher)
.DESCRIPTION
  Detects your Zen Browser profile under %APPDATA%\zen\Profiles and installs the mod
  into Sine (sine-mods) and/or fx-autoconfig (chrome/JS + userChrome.css).
#>

param(
    [string]$ProfilePath = ""
)

$ErrorActionPreference = "Stop"
$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $ProfilePath) {
    $ZenProfilesRoot = Join-Path $env:APPDATA "zen\Profiles"
    if (-not (Test-Path $ZenProfilesRoot)) {
        Write-Host "[!] Could not find Zen Browser profiles at $ZenProfilesRoot" -ForegroundColor Red
        exit 1
    }

    $Profiles = Get-ChildItem -Path $ZenProfilesRoot -Directory
    $ReleaseProfile = $Profiles | Where-Object { $_.Name -like "*Default (release)*" } | Select-Object -First 1
    if (-not $ReleaseProfile) {
        $ReleaseProfile = $Profiles | Select-Object -First 1
    }
    $ProfilePath = $ReleaseProfile.FullName
}

Write-Host "Target Zen Profile: $ProfilePath" -ForegroundColor Cyan

$ChromeDir = Join-Path $ProfilePath "chrome"
if (-not (Test-Path $ChromeDir)) {
    New-Item -ItemType Directory -Path $ChromeDir | Out-Null
}

# 1. If Sine is used or for Sine local mod folder
$SineModDir = Join-Path $ChromeDir "sine-mods\zen-dual-tab-views"
New-Item -ItemType Directory -Force -Path $SineModDir | Out-Null
Copy-Item (Join-Path $RepoDir "theme.json") $SineModDir -Force
Copy-Item (Join-Path $RepoDir "preferences.json") $SineModDir -Force
Copy-Item (Join-Path $RepoDir "chrome.css") $SineModDir -Force
Copy-Item (Join-Path $RepoDir "zen-dual-tabs.uc.mjs") $SineModDir -Force
Write-Host "[+] Installed Sine mod package to: $SineModDir" -ForegroundColor Green

# 2. Also copy to chrome/JS and chrome/zen-dual-tabs.css for fx-autoconfig compatibility
$JsDir = Join-Path $ChromeDir "JS"
New-Item -ItemType Directory -Force -Path $JsDir | Out-Null
Copy-Item (Join-Path $RepoDir "zen-dual-tabs.uc.mjs") (Join-Path $JsDir "zen-dual-tabs.uc.mjs") -Force
Copy-Item (Join-Path $RepoDir "chrome.css") (Join-Path $ChromeDir "zen-dual-tabs.css") -Force

$UserChromeFile = Join-Path $ChromeDir "userChrome.css"
$ImportLine = '@import "zen-dual-tabs.css";'
if (-not (Test-Path $UserChromeFile)) {
    Set-Content -Path $UserChromeFile -Value $ImportLine -Encoding UTF8
    Write-Host "[+] Created userChrome.css with @import 'zen-dual-tabs.css'" -ForegroundColor Green
} else {
    $CurrentContent = Get-Content -Path $UserChromeFile -Raw
    if ($CurrentContent -notmatch "zen-dual-tabs\.css") {
        Set-Content -Path $UserChromeFile -Value ($ImportLine + "`r`n" + $CurrentContent) -Encoding UTF8
        Write-Host "[+] Added @import 'zen-dual-tabs.css' to top of userChrome.css" -ForegroundColor Green
    } else {
        Write-Host "[i] userChrome.css already imports zen-dual-tabs.css" -ForegroundColor Yellow
    }
}

# 3. Ensure fx-autoconfig loader is installed (profile chrome/utils + Zen program folder)
$ZenInstallDir = "C:\Program Files\Zen Browser"
$FxTemp = Join-Path $env:TEMP "fx-autoconfig-setup\fx-autoconfig-master"
if (-not (Test-Path $FxTemp)) {
    Write-Host "[i] Downloading fx-autoconfig script loader..." -ForegroundColor Cyan
    $ZipPath = Join-Path $env:TEMP "fx-autoconfig.zip"
    Invoke-WebRequest -Uri "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip" -OutFile $ZipPath
    Expand-Archive -Path $ZipPath -DestinationPath (Join-Path $env:TEMP "fx-autoconfig-setup") -Force
}

if (Test-Path $FxTemp) {
    Copy-Item -Path "$FxTemp\profile\chrome\utils" -Destination "$ChromeDir\utils" -Recurse -Force
    Copy-Item -Path "$FxTemp\profile\chrome\resources" -Destination "$ChromeDir\resources" -Recurse -Force
    Copy-Item -Path "$FxTemp\profile\chrome\CSS" -Destination "$ChromeDir\CSS" -Recurse -Force
    Write-Host "[+] Installed fx-autoconfig profile loader into $ChromeDir\utils" -ForegroundColor Green

    if ((Test-Path $ZenInstallDir) -and (-not (Test-Path "$ZenInstallDir\config.js"))) {
        try {
            Copy-Item -Path "$FxTemp\program\config.js" -Destination "$ZenInstallDir\config.js" -Force -ErrorAction Stop
            Copy-Item -Path "$FxTemp\program\defaults\pref\config-prefs.js" -Destination "$ZenInstallDir\defaults\pref\config-prefs.js" -Force -ErrorAction Stop
            Write-Host "[+] Installed config.js and config-prefs.js into $ZenInstallDir" -ForegroundColor Green
        } catch {
            try {
                Write-Host "[i] Requesting Administrator permission to copy config.js into $ZenInstallDir..." -ForegroundColor Yellow
                $Cmd = "Copy-Item -Path '$FxTemp\program\config.js' -Destination '$ZenInstallDir\config.js' -Force; Copy-Item -Path '$FxTemp\program\defaults\pref\config-prefs.js' -Destination '$ZenInstallDir\defaults\pref\config-prefs.js' -Force"
                Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$Cmd`"" -Wait -ErrorAction Stop
            } catch {
                Write-Host "[!] Could not copy config.js automatically (requires Administrator PowerShell)." -ForegroundColor Yellow
                Write-Host "    Run .\install-local.ps1 in an Administrator PowerShell window once to copy config.js into '$ZenInstallDir'." -ForegroundColor Yellow
            }
        }
    }
}

# 4. Enable legacyUserProfileCustomizations.stylesheets in user.js so userChrome.css is always loaded
$UserJsFile = Join-Path $ProfilePath "user.js"
$PrefLine = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'
if (-not (Test-Path $UserJsFile)) {
    Set-Content -Path $UserJsFile -Value $PrefLine -Encoding UTF8
    Write-Host "[+] Created user.js with toolkit.legacyUserProfileCustomizations.stylesheets = true" -ForegroundColor Green
} else {
    $UserJsContent = Get-Content -Path $UserJsFile -Raw
    if ($UserJsContent -notmatch "toolkit\.legacyUserProfileCustomizations\.stylesheets") {
        Add-Content -Path $UserJsFile -Value "`r`n$PrefLine" -Encoding UTF8
        Write-Host "[+] Enabled toolkit.legacyUserProfileCustomizations.stylesheets in user.js" -ForegroundColor Green
    }
}

Write-Host "`nDone! Restart Zen Browser (and click 'Clear Startup Cache...' in about:support) to activate." -ForegroundColor Cyan
Write-Host "Default Shortcuts: Alt+X (Cursor Tab View) | Alt+Z (Bottom Tab Dock)" -ForegroundColor Green

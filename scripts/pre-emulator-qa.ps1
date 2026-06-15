# pre-emulator-qa.ps1 -- O-26: guarantee the Android emulator can reach the PC's
# Metro/Expo dev server (8081) BEFORE every native/emulator QA cycle, so QA never
# hits "Cannot connect to Expo CLI" (10.0.2.2:8081 / Error: undefined).
#
# Run this at the start of each emulator QA cycle (AG runbook + Claude pre-QA hook).
# Do NOT rely on a one-off manual `adb reverse` -- the mapping is lost on emulator
# restart / Metro restart, which is exactly what bit O-23 Stage4 native QA.
#
# Checks, in order:
#   1. adb resolvable (PATH or the default Android SDK platform-tools path)
#   2. an emulator is recognized as a "device" (adb devices)
#   3. Metro dev server answers packager-status:running on :8081 (optionally start it)
#   4. adb reverse tcp:8081 tcp:8081 is set (emulator -> PC localhost)
#
# Exit: 0 = all guaranteed; non-zero = a precondition could not be satisfied (the
# message says exactly what to do). Usage:
#   pwsh -File scripts/pre-emulator-qa.ps1
#   pwsh -File scripts/pre-emulator-qa.ps1 -StartMetro       # auto-start Metro if down
#   pwsh -File scripts/pre-emulator-qa.ps1 -Port 8081 -ProjectDir "E:\2ndB"
param(
  [string]$ProjectDir = (Split-Path $PSScriptRoot -Parent),
  [int]$Port = 8081,
  [switch]$StartMetro
)
$ErrorActionPreference = "Continue"
function Log($m) { Write-Host "[pre-qa] $m" }
function Fail($code, $m) { Log $m; exit $code }

# 1) adb -------------------------------------------------------------------
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  $cand = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
  if (Test-Path $cand) { $adb = $cand }
}
if (-not $adb) { Fail 2 "adb not found. Put platform-tools on PATH or set ANDROID_HOME (`$env:LOCALAPPDATA\Android\Sdk\platform-tools)." }
Log "adb: $adb"

# 2) emulator recognized ---------------------------------------------------
$devices = & $adb devices 2>$null
$emu = ($devices | Select-String -Pattern "^(emulator-\d+|[0-9.:]+)\s+device$")
if (-not $emu) {
  Log "adb devices:`n$($devices -join "`n")"
  Fail 3 "No emulator/device in 'device' state. Boot the emulator (e.g. Pixel_9_Pro_XL) and re-run."
}
Log "device OK: $(($emu.Matches[0].Value -split '\s+')[0])"

# 3) Metro dev server ------------------------------------------------------
function Test-Metro {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/status" -TimeoutSec 4 -UseBasicParsing
    # Metro's /status sends no text Content-Type, so PowerShell returns Content as a
    # byte[]; decode it before matching (the bug that made this check false-negative).
    $body = if ($r.Content -is [byte[]]) { [System.Text.Encoding]::ASCII.GetString($r.Content) } else { [string]$r.Content }
    return ($body -match "packager-status:running")
  } catch { return $false }
}
if (-not (Test-Metro)) {
  if ($StartMetro) {
    if (-not (Test-Path $ProjectDir)) { Fail 5 "ProjectDir '$ProjectDir' not found." }
    Log "Metro down -> starting 'npx expo start --port $Port' in $ProjectDir (minimized)..."
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx expo start --port $Port" -WorkingDirectory $ProjectDir -WindowStyle Minimized
    for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Seconds 2; if (Test-Metro) { break } }
  }
  if (-not (Test-Metro)) { Fail 4 "Metro (dev server) not running on $Port. Run 'cd $ProjectDir; npx expo start' (or pass -StartMetro)." }
}
Log "Metro OK: packager-status:running on $Port"

# 4) adb reverse (idempotent) ---------------------------------------------
& $adb reverse tcp:$Port tcp:$Port 2>$null | Out-Null
$rev = & $adb reverse --list 2>$null
if ($rev -match "tcp:$Port tcp:$Port") { Log "adb reverse OK: tcp:$Port -> tcp:$Port" }
else { Fail 6 "adb reverse tcp:$Port did not stick. Re-run; if it persists, check the emulator is the only target." }

Log "PRE-QA OK -- emulator can reach Metro on :$Port. 'Cannot connect to Expo CLI' should not occur."
exit 0

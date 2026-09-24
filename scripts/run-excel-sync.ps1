$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mutex = New-Object System.Threading.Mutex($false, "SiteRescueStudioExcelSync")
$locked = $false
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { exit 0 }
  Push-Location $repoRoot
  & "C:\Program Files\nodejs\node.exe" "lib\neonToExcel.js" --scheduled
  if ($LASTEXITCODE -ne 0) { throw "Excel sync exited with code $LASTEXITCODE." }
}
finally {
  Pop-Location -ErrorAction SilentlyContinue
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}

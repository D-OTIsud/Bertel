param(
  [string] $DatabasePath = "old-data-profile.duckdb"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sqlPath = "docs/mapping-workbench/sql/old-data-profile.duckdb.sql"

$duckdbCommand = Get-Command duckdb -ErrorAction SilentlyContinue
$duckdbPath = if ($duckdbCommand) { $duckdbCommand.Source } else { $null }

if (-not $duckdbPath) {
  $localCandidates = @(
    (Join-Path $repoRoot ".tools\python\Scripts\duckdb.exe"),
    (Join-Path $repoRoot "tools\duckdb\duckdb.exe")
  )

  foreach ($candidate in $localCandidates) {
    if (Test-Path -LiteralPath $candidate) {
      $duckdbPath = $candidate
      break
    }
  }
}

if (-not $duckdbPath) {
  Write-Error "DuckDB CLI was not found on PATH or in .tools\python\Scripts. Install DuckDB, then rerun this script from PowerShell."
}

Push-Location $repoRoot
try {
  & $duckdbPath $DatabasePath "-c" ".read $sqlPath"
}
finally {
  Pop-Location
}

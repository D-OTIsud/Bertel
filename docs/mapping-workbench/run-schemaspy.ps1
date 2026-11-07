param(
  [string] $HostName = $env:PGHOST,
  [int] $Port = $(if ($env:PGPORT) { [int] $env:PGPORT } else { 5432 }),
  [string] $Database = $env:PGDATABASE,
  [string] $User = $env:PGUSER,
  [string] $Password = $env:PGPASSWORD,
  [string] $Schema = "public",
  [string] $OutputPath = "docs/mapping-workbench/schemaspy-output"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$schemaSpyJar = Join-Path $repoRoot ".tools\schemaspy\schemaspy-7.0.2-app.jar"
$jdbcJar = Join-Path $repoRoot ".tools\schemaspy\postgresql-42.7.11.jar"
$dotExe = Join-Path $repoRoot ".tools\graphviz\Graphviz-14.1.5-win64\bin\dot.exe"
$outputFullPath = Join-Path $repoRoot $OutputPath

if (-not $HostName) { Write-Error "Missing database host. Pass -HostName or set PGHOST." }
if (-not $Database) { Write-Error "Missing database name. Pass -Database or set PGDATABASE." }
if (-not $User) { Write-Error "Missing database user. Pass -User or set PGUSER." }
if (-not (Test-Path -LiteralPath $schemaSpyJar)) { Write-Error "SchemaSpy jar was not found at $schemaSpyJar." }
if (-not (Test-Path -LiteralPath $jdbcJar)) { Write-Error "PostgreSQL JDBC jar was not found at $jdbcJar." }
if (-not (Test-Path -LiteralPath $dotExe)) { Write-Error "Graphviz dot.exe was not found at $dotExe." }

New-Item -ItemType Directory -Force -Path $outputFullPath | Out-Null

$env:PATH = "$(Split-Path -Parent $dotExe);$env:PATH"

$args = @(
  "-t", "pgsql",
  "-host", $HostName,
  "-port", "$Port",
  "-db", $Database,
  "-s", $Schema,
  "-u", $User,
  "-o", $outputFullPath,
  "-dp", $jdbcJar
)

if ($Password) {
  $args += @("-p", $Password)
}

Push-Location $repoRoot
try {
  & java -jar $schemaSpyJar @args
}
finally {
  Pop-Location
}

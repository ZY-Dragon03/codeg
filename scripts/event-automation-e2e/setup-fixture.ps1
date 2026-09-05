param(
  [Parameter(Mandatory = $true)] [string] $DataRoot,
  [string] $ReceiptPath = ''
)

$ErrorActionPreference = 'Stop'

$fixtureRoot = (Resolve-Path (Join-Path $PSScriptRoot 'fixture-package')).Path
$prefix = Join-Path $DataRoot 'npm-global'
New-Item -ItemType Directory -Force -Path $prefix | Out-Null
New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

$npmArgs = @('install', '--global', '--prefix', $prefix, $fixtureRoot)
& npm @npmArgs
if ($LASTEXITCODE -ne 0) { throw "npm fixture install failed: $LASTEXITCODE" }

$env:NPM_CONFIG_PREFIX = $prefix
if ($ReceiptPath) { $env:CODEG_E2E_FIXTURE_RECEIPT = (Resolve-Path $ReceiptPath -ErrorAction SilentlyContinue)?.Path ?? $ReceiptPath }
Write-Output "NPM_CONFIG_PREFIX=$prefix"
Write-Output "FIXTURE_COMMAND=$(Join-Path $prefix 'codeg-event-automation-fixture.cmd')"

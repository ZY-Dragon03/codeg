param([string] $DataRoot = '')
$ErrorActionPreference = 'Stop'
if (-not $DataRoot) { $DataRoot = Join-Path $env:TEMP 'codeg-event-fixture-selftest' }
if (Test-Path -LiteralPath $DataRoot) { Remove-Item -LiteralPath $DataRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
$receipt = Join-Path $DataRoot 'receipt.jsonl'
& pwsh.exe -NoLogo -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'setup-fixture.ps1') -DataRoot $DataRoot -ReceiptPath $receipt
if ($LASTEXITCODE -ne 0) { throw 'setup failed' }
$env:CODEG_E2E_FIXTURE_RECEIPT = $receipt
$env:CODEG_E2E_FIXTURE_FAILURES = 'fail,success'
$env:CODEG_E2E_FIXTURE_CONTROL = Join-Path $DataRoot 'control.json'
Set-Content -LiteralPath $env:CODEG_E2E_FIXTURE_CONTROL -Value '{"outcomes":["fail","success"],"delay_ms":5}' -Encoding utf8
$command = Join-Path $DataRoot 'npm-global\codeg-event-automation-fixture.cmd'
$messages = @(
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}'
  '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"C:\\tmp"}}'
  '{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"fixture-session-test","prompt":[{"type":"text","text":"trigger failure"}]}}'
  '{"jsonrpc":"2.0","id":4,"method":"session/prompt","params":{"sessionId":"fixture-session-test","prompt":[{"type":"text","text":"recovery prompt"}]}}'
)
$messages -join "`n" | & $command
if ($LASTEXITCODE -ne 0) { throw "fixture exited $LASTEXITCODE" }
if ((Get-Content -LiteralPath $receipt).Count -ne 6) { throw 'unexpected receipt count' }
Write-Output "fixture selftest passed: $receipt"

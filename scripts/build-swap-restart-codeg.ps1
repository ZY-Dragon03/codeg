# Build Codeg into an unused directory, then swap onto the live exe and restart.
# Must run detached: this session's host is the live codeg.exe.

param(
    [int]$DelaySeconds = 12,
    [string]$RepoRoot = 'F:\AI_PROJECTS\codeg',
    [string]$LiveDir = 'F:\AI_PROJECTS\codeg\src-tauri\target\release',
    [string]$NextDir = 'F:\AI_PROJECTS\codeg\src-tauri\target-next',
    [string]$LogPath = 'F:\AI_PROJECTS\codeg\scripts\swap-and-restart-codeg.log'
)

$ErrorActionPreference = 'Continue'

function Write-Log([string]$Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'o'), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
Write-Log ("pipeline start delay={0}s" -f $DelaySeconds)
Start-Sleep -Seconds $DelaySeconds

$cargoTomlDir = Join-Path $RepoRoot 'src-tauri'
$nextRelease = Join-Path $NextDir 'release'
$newCodeg = Join-Path $nextRelease 'codeg.exe'
$newMcp = Join-Path $nextRelease 'codeg-mcp.exe'
$liveCodeg = Join-Path $LiveDir 'codeg.exe'
$liveMcp = Join-Path $LiveDir 'codeg-mcp.exe'

Write-Log 'starting cargo build into target-next'
$cargo = Get-Command cargo -ErrorAction Stop
$cargoArgs = @(
    'build'
    '--release'
    '--bin'
    'codeg'
    '--bin'
    'codeg-mcp'
    '--target-dir'
    $NextDir
)
$build = Start-Process -FilePath $cargo.Source -ArgumentList $cargoArgs -WorkingDirectory $cargoTomlDir -Wait -PassThru -NoNewWindow
$buildCode = $build.ExitCode
Write-Log ("cargo exit={0}" -f $buildCode)
if ($buildCode -ne 0) {
    Write-Log 'build failed; not restarting'
    exit $buildCode
}

if (-not (Test-Path -LiteralPath $newCodeg)) {
    Write-Log ("missing {0}" -f $newCodeg)
    exit 1
}
if (-not (Test-Path -LiteralPath $newMcp)) {
    Write-Log ("missing {0}" -f $newMcp)
    exit 1
}

$item = Get-Item -LiteralPath $newCodeg
Write-Log ("new binary mtime={0:o} size={1}" -f $item.LastWriteTime, $item.Length)

$procs = Get-CimInstance Win32_Process -Filter "Name = 'codeg.exe'"
foreach ($proc in $procs) {
    $path = $proc.ExecutablePath
    Write-Log ("stopping pid={0} path={1}" -f $proc.ProcessId, $path)
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 3

New-Item -ItemType Directory -Force -Path $LiveDir | Out-Null
$copied = $true
try {
    Copy-Item -LiteralPath $newCodeg -Destination $liveCodeg -Force
    Copy-Item -LiteralPath $newMcp -Destination $liveMcp -Force
    Write-Log ("copied into {0}" -f $LiveDir)
} catch {
    $copied = $false
    Write-Log ("copy failed: {0}" -f $_.Exception.Message)
}

$startExe = $liveCodeg
if (-not $copied) {
    $startExe = $newCodeg
    Write-Log 'starting from target-next because live copy failed'
}

$startParams = @{
    FilePath         = $startExe
    WorkingDirectory = $RepoRoot
    WindowStyle      = 'Normal'
}
Start-Process @startParams
Write-Log ("started {0}" -f $startExe)
exit 0

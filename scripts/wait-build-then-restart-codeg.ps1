# Wait until the release binary is rebuilt, then restart Codeg.
# Detached from the chat host so this session can finish before Codeg exits.

param(
    [string]$ExePath = 'F:\AI_PROJECTS\codeg\src-tauri\target\release\codeg.exe',
    [string]$LogPath = 'F:\AI_PROJECTS\codeg\scripts\restart-codeg.log',
    [string]$WorkDir = 'F:\AI_PROJECTS\codeg',
    [string]$NewerThanUtc = '',
    [int]$TimeoutMinutes = 40,
    [int]$PollSeconds = 8,
    [int]$SettleSeconds = 8
)

$ErrorActionPreference = 'Continue'

function Write-Log([string]$Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'o'), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
Write-Log ("wait-build-then-restart exe={0} newerThanUtc={1}" -f $ExePath, $NewerThanUtc)

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$threshold = $null
if (-not [string]::IsNullOrWhiteSpace($NewerThanUtc)) {
    $threshold = [datetime]::Parse($NewerThanUtc, [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AdjustToUniversal -bor [System.Globalization.DateTimeStyles]::AssumeUniversal)
}

$ready = $false
while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $ExePath) {
        $item = Get-Item -LiteralPath $ExePath
        if ($null -eq $threshold -or $item.LastWriteTimeUtc -gt $threshold) {
            Write-Log ("new binary mtime={0:o} size={1}" -f $item.LastWriteTimeUtc, $item.Length)
            $ready = $true
            break
        }
        Write-Log ("waiting for newer binary current_mtime={0:o}" -f $item.LastWriteTimeUtc)
    } else {
        Write-Log 'waiting for exe to appear'
    }
    Start-Sleep -Seconds $PollSeconds
}

if (-not $ready) {
    Write-Log 'timeout waiting for release binary; not restarting'
    exit 2
}

Start-Sleep -Seconds $SettleSeconds

$resolvedExe = (Get-Item -LiteralPath $ExePath).FullName
$procs = Get-CimInstance Win32_Process -Filter "Name = 'codeg.exe'"
foreach ($proc in $procs) {
    $path = $proc.ExecutablePath
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    $full = $path
    try { $full = (Get-Item -LiteralPath $path).FullName } catch { $full = $path }
    $isOurs = ($full -eq $resolvedExe) -or ($full -like '*\target\release\deps\codeg.exe') -or ($full -like '*\Codeg\codeg.exe')
    if ($isOurs) {
        Write-Log ("stopping pid={0} path={1}" -f $proc.ProcessId, $full)
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 3
$startParams = @{
    FilePath         = $resolvedExe
    WorkingDirectory = $WorkDir
    WindowStyle      = 'Normal'
}
Start-Process @startParams
Write-Log ("started {0}" -f $resolvedExe)
exit 0

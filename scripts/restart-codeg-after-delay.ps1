# Restart Codeg after a delay (detached from the chat session)

param(
    [int]$DelaySeconds = 25,
    [string]$ExePath = 'F:\AI_PROJECTS\codeg\src-tauri\target\release\codeg.exe',
    [string]$LogPath = 'F:\AI_PROJECTS\codeg\scripts\restart-codeg.log',
    [string]$WorkDir = 'F:\AI_PROJECTS\codeg'
)

$ErrorActionPreference = 'Continue'
$started = Get-Date -Format 'o'
function Write-Log([string]$Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'o'), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
Write-Log ("watchdog start delay={0}s exe={1} at {2}" -f $DelaySeconds, $ExePath, $started)

Start-Sleep -Seconds $DelaySeconds

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Log ("missing exe: {0}" -f $ExePath)
    exit 1
}

$resolvedExe = (Get-Item -LiteralPath $ExePath).FullName
$procs = Get-CimInstance Win32_Process -Filter "Name = 'codeg.exe'"
foreach ($proc in $procs) {
    $path = $proc.ExecutablePath
    if ([string]::IsNullOrWhiteSpace($path)) {
        continue
    }
    $full = $path
    try {
        $full = (Get-Item -LiteralPath $path).FullName
    } catch {
        $full = $path
    }
    $isRelease = $full -eq $resolvedExe
    $isDeps = $full -like '*\target\release\deps\codeg.exe'
    $isOfficial = $full -like '*\Codeg\codeg.exe'
    if ($isRelease -or $isDeps -or $isOfficial) {
        Write-Log ("stopping pid={0} path={1}" -f $proc.ProcessId, $full)
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 3

$startParams = @{
    FilePath = $resolvedExe
    WorkingDirectory = $WorkDir
    WindowStyle = 'Normal'
}
Start-Process @startParams
Write-Log ("started {0}" -f $resolvedExe)
exit 0

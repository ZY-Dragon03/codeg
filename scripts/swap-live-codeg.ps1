# 离线切换：把 target-next 里编好的 Codeg 装到正在用的 target\release，并启动。
# 不依赖当前对话。可双击 swap-live-codeg.cmd，或在资源管理器外的终端运行。
#
# 解决的问题：codeg.exe 正在运行时直接覆盖会失败或假装成功；
# 本脚本先停进程，再用「改名让路 + 校验哈希」替换，确认文件真的换成新的才启动。

param(
    [string]$RepoRoot = 'F:\AI_PROJECTS\codeg',
    [string]$LiveDir = 'F:\AI_PROJECTS\codeg\src-tauri\target\release',
    [string]$NextReleaseDir = 'F:\AI_PROJECTS\codeg\src-tauri\target-next\release',
    [string]$LogPath = 'F:\AI_PROJECTS\codeg\scripts\swap-live-codeg.log',
    [int]$StopWaitSeconds = 20,
    [int]$ReplaceTries = 8
)

$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'o'), $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    Write-Host $line
}

function Get-FileSha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Stop-AllCodeg {
    $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'codeg.exe'" -ErrorAction SilentlyContinue)
    foreach ($proc in $procs) {
        Write-Log ("stopping pid={0} path={1}" -f $proc.ProcessId, $proc.ExecutablePath)
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    $deadline = (Get-Date).AddSeconds($StopWaitSeconds)
    while ((Get-Date) -lt $deadline) {
        $left = @(Get-Process -Name 'codeg' -ErrorAction SilentlyContinue)
        if ($left.Count -eq 0) {
            Write-Log 'no codeg.exe remaining'
            return
        }
        Start-Sleep -Seconds 1
    }
    $still = @(Get-Process -Name 'codeg' -ErrorAction SilentlyContinue)
    if ($still.Count -gt 0) {
        throw ("codeg.exe still running after stop: {0}" -f ($still.Id -join ','))
    }
}

function Replace-Binary {
    param(
        [string]$SourcePath,
        [string]$DestPath
    )
    if (-not (Test-Path -LiteralPath $SourcePath)) {
        throw "missing source $SourcePath"
    }
    $want = Get-FileSha256 $SourcePath
    $destDir = Split-Path -Parent $DestPath
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null

    $staged = "$DestPath.new"
    $prev = "$DestPath.prev"
    Copy-Item -LiteralPath $SourcePath -Destination $staged -Force

    $try = 0
    while ($try -lt $ReplaceTries) {
        $try += 1
        try {
            if (Test-Path -LiteralPath $DestPath) {
                if (Test-Path -LiteralPath $prev) {
                    Remove-Item -LiteralPath $prev -Force -ErrorAction SilentlyContinue
                }
                Move-Item -LiteralPath $DestPath -Destination $prev -Force
            }
            Move-Item -LiteralPath $staged -Destination $DestPath -Force
            $got = Get-FileSha256 $DestPath
            if ($got -ne $want) {
                throw ("hash mismatch dest={0} want={1} got={2}" -f $DestPath, $want, $got)
            }
            Write-Log ("replaced {0} sha256={1}" -f $DestPath, $got)
            return
        } catch {
            Write-Log ("replace try {0}/{1} failed: {2}" -f $try, $ReplaceTries, $_.Exception.Message)
            Stop-AllCodeg
            Start-Sleep -Seconds (2 * $try)
        }
    }
    throw "failed to replace $DestPath after $ReplaceTries tries"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
Write-Log 'swap-live-codeg start'

$srcCodeg = Join-Path $NextReleaseDir 'codeg.exe'
$srcMcp = Join-Path $NextReleaseDir 'codeg-mcp.exe'
$dstCodeg = Join-Path $LiveDir 'codeg.exe'
$dstMcp = Join-Path $LiveDir 'codeg-mcp.exe'

if (-not (Test-Path -LiteralPath $srcCodeg)) {
    throw "new codeg.exe not found: $srcCodeg — compile into target-next first"
}
if (-not (Test-Path -LiteralPath $srcMcp)) {
    throw "new codeg-mcp.exe not found: $srcMcp"
}

Write-Log ("source codeg mtime={0:o} size={1}" -f (Get-Item -LiteralPath $srcCodeg).LastWriteTime, (Get-Item -LiteralPath $srcCodeg).Length)

Stop-AllCodeg
Replace-Binary -SourcePath $srcMcp -DestPath $dstMcp
Replace-Binary -SourcePath $srcCodeg -DestPath $dstCodeg

$liveHash = Get-FileSha256 $dstCodeg
$nextHash = Get-FileSha256 $srcCodeg
if ($liveHash -ne $nextHash) {
    throw "final check failed: live codeg.exe is not the new binary"
}

$startParams = @{
    FilePath         = $dstCodeg
    WorkingDirectory = $RepoRoot
    WindowStyle      = 'Normal'
}
Start-Process @startParams
Write-Log ("started {0}" -f $dstCodeg)
Write-Log 'swap-live-codeg ok'
exit 0

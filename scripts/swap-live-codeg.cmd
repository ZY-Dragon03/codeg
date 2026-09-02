@echo off
setlocal
cd /d "%~dp0"
echo Switching Codeg to the target-next build...
echo Log: %~dp0swap-live-codeg.log
where pwsh.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell 7 ^(pwsh.exe^) was not found on PATH.
  pause
  exit /b 1
)
pwsh.exe -NoLogo -NoProfile -NonInteractive -File "%~dp0swap-live-codeg.ps1"
if errorlevel 1 (
  echo.
  echo FAILED. See swap-live-codeg.log
  pause
  exit /b 1
)
echo.
echo Done. Codeg should restart with the new binary.
exit /b 0

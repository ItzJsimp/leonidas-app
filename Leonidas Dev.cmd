@echo off
rem Double-click to open "Leonidas (Dev)" beside the real app.
rem Pass -Stop to close it, or -Status to see if it is running.
where pwsh >nul 2>nul && (set "PS=pwsh") || (set "PS=powershell")
%PS% -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-LeonidasDev.ps1" %*
echo.
pause

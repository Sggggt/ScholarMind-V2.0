@echo off
setlocal

set "BACKEND_DIR=%~dp0"
title ScholarMind - Cloudflare Tunnel
chcp 65001>nul
cd /d "%BACKEND_DIR%"

cls
echo ========================================
echo   Cloudflare Tunnel
echo ========================================
echo.
echo Target: http://127.0.0.1:8000
echo.
echo A public URL will be shown below.
echo Copy it and update your mobile settings.
echo.
echo Press Ctrl+C to stop the tunnel
echo ========================================
echo.

REM Find cloudflared
set "CLOUDFLARED_CMD="

REM Check PATH
where cloudflared >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "CLOUDFLARED_CMD=cloudflared"
    goto :run
)

REM Check WinGet location
for %%f in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_*\cloudflared-windows-amd64.exe") do (
    if exist "%%~f" (
        set "CLOUDFLARED_CMD=%%~f"
        goto :run
    )
)

REM Use npx as fallback
where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "CLOUDFLARED_CMD=npx cloudflared"
    goto :run
)

echo ERROR: cloudflared not found!
echo.
echo Install with: winget install Cloudflare.cloudflared
echo Or use: npx cloudflared tunnel --url http://127.0.0.1:8000
echo.
pause
exit /b 1

:run
echo Starting tunnel...
echo.

REM Run tunnel directly
%CLOUDFLARED_CMD% tunnel --url http://127.0.0.1:8000

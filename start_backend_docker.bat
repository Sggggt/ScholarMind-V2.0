@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"

title ScholarMind Backend (Docker)
chcp 65001>nul
cd /d "%ROOT_DIR%"

echo ========================================
echo   ScholarMind Backend (Docker)
echo ========================================
echo.
docker version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker Desktop is not ready.
    pause
    exit /b 1
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ips = Get-NetIPConfiguration ^| Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -ne $null } ^| ForEach-Object { $_.IPv4Address.IPAddress } ^| Where-Object { $parts = $_ -split '\.'; $_.StartsWith('10.') -or $_.StartsWith('192.168.') -or ($parts.Length -ge 2 -and $parts[0] -eq '172' -and [int]$parts[1] -ge 16 -and [int]$parts[1] -le 31) } ^| Sort-Object -Unique; [string]::Join(',', $ips)"`) do set "HOST_LAN_IPS=%%I"
if defined HOST_LAN_IPS (
    echo Using host LAN IPs: %HOST_LAN_IPS%
)

set "NEED_BUILD=0"
if /I "%~1"=="--build" set "NEED_BUILD=1"
docker image inspect scholarmind-backend:latest >nul 2>nul
if %ERRORLEVEL% NEQ 0 set "NEED_BUILD=1"

docker compose rm -f -s backend >nul 2>nul

if "%NEED_BUILD%"=="1" (
    echo Building backend image...
    echo.
    docker compose build backend
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to build backend image.
        pause
        exit /b 1
    )
)

echo Starting backend container...
echo.

docker compose up -d --force-recreate backend
if %ERRORLEVEL% NEQ 0 (
    if "%NEED_BUILD%"=="0" (
        echo Existing image start failed. Trying rebuild once...
        echo.
        docker compose build backend
        if %ERRORLEVEL% EQU 0 (
            docker compose up -d --force-recreate backend
        )
    )
)

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start backend container.
    pause
    exit /b 1
)

echo Backend container is running. Following logs...
echo Press Ctrl+C to stop log follow. The container will keep running.
echo.

docker compose logs -f backend

@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%react-client"
set "MOBILE_DIR=%ROOT_DIR%mobile"
set "BACKEND_START_SCRIPT=%BACKEND_DIR%\start_backend.bat"
set "FRONTEND_LOG_DIR=%ROOT_DIR%tmp"
set "FRONTEND_LOG=%FRONTEND_LOG_DIR%\frontend-dev.log"
set "FRONTEND_URL=http://localhost:5173"

cls
echo ========================================
echo   ScholarMind - Complete Launch
echo ========================================
echo.
echo This will start:
echo   [1/3] Backend Service  (http://localhost:8000)
echo   [2/3] Desktop Client   (http://localhost:5173)
echo   [3/3] Cloudflare Tunnel (Public URL)
echo.
echo ========================================
echo.

REM ============================================
REM 1/3 - Start Backend Service
REM ============================================
echo [1/3] Starting Backend Service...
if exist "%BACKEND_START_SCRIPT%" (
    start "ScholarMind Backend" cmd /k ""%BACKEND_START_SCRIPT%""
) else (
    start "ScholarMind Backend" cmd /k "title ScholarMind Backend && chcp 65001>nul && cd /d ""%BACKEND_DIR%"" && python -m main"
)

REM Wait for backend to initialize
echo Waiting for backend to start...
timeout /t 5 /nobreak > nul

REM ============================================
REM 2/3 - Start Desktop Client
REM ============================================
if not exist "%FRONTEND_LOG_DIR%" mkdir "%FRONTEND_LOG_DIR%" >nul 2>nul
type nul > "%FRONTEND_LOG%"

echo [2/3] Starting Desktop Client in hidden window...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$frontendDir = [System.IO.Path]::GetFullPath('%FRONTEND_DIR%'); $logPath = [System.IO.Path]::GetFullPath('%FRONTEND_LOG%'); $command = 'Set-Location -LiteralPath ''' + $frontendDir + '''; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & npm.cmd run dev *>> ''' + $logPath + ''''; Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) -WorkingDirectory $frontendDir -WindowStyle Hidden"

REM Wait for frontend to start
echo Waiting for desktop client to become ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = '%FRONTEND_URL%'; $deadline = (Get-Date).AddSeconds(30); while ((Get-Date) -lt $deadline) { try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1"
if %ERRORLEVEL% EQU 0 (
    echo Opening browser...
    start "" "%FRONTEND_URL%"
) else (
    echo [WARNING] Desktop Client did not respond within 30 seconds.
    echo [WARNING] Check frontend log: %FRONTEND_LOG%
    echo Opening browser anyway...
    start "" "%FRONTEND_URL%"
)

REM ============================================
REM 3/3 - Start Cloudflare Tunnel
REM ============================================
echo [3/3] Starting Cloudflare Tunnel...
echo.

REM Check if cloudflared is available
where cloudflared >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "ScholarMind Tunnel" cmd /k "title ScholarMind Tunnel && chcp 65001>nul && cd /d ""%BACKEND_DIR%"" && start_tunnel.bat"
    goto :success
)

REM Try npx cloudflared as fallback
where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "ScholarMind Tunnel" cmd /k "title ScholarMind Tunnel && chcp 65001>nul && cd /d ""%BACKEND_DIR%"" && npx cloudflared tunnel --url http://127.0.0.1:8000"
    goto :success
)

REM No cloudflared found - skip tunnel
echo [WARNING] cloudflared not found!
echo.
echo To use Cloudflare Tunnel, install it with:
echo   winget install Cloudflare.cloudflared
echo.
echo Or use:
echo   npx cloudflared tunnel --url http://127.0.0.1:8000
echo.
echo ========================================

:success
cls
echo ========================================
echo   ScholarMind - All Services Started
echo ========================================
echo.
echo [RUNNING SERVICES]
echo.
echo   Backend API:     http://localhost:8000
echo   Desktop Client:  %FRONTEND_URL%
echo.
echo [MOBILE ACCESS]
echo.
echo   Check connection info:
echo   http://localhost:8000/api/connection-info
echo.
echo   Use the Public/Tunnel URL shown in the
echo   Tunnel window for remote access.
echo.
echo [ADDITIONAL]
echo.
echo   Mobile Client:   Run 'start_mobile.bat'
echo   Frontend Log:    %FRONTEND_LOG%
echo.
echo   Press any key to close this window...
echo   (Services will continue running)
echo ========================================
echo.

timeout /t 10 /nobreak > nul
pause

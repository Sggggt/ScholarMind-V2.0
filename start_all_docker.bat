@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_URL=http://localhost:5173"

cls
echo ========================================
echo   ScholarMind - Docker Desktop Launch
echo ========================================
echo.
echo This will start:
echo   [1/3] Backend Service  (Docker, visible window)
echo   [2/3] Desktop Client   (Docker, hidden window)
echo   [3/3] Cloudflare Tunnel (visible window)
echo.
echo ========================================
echo.

REM ============================================
REM 1/3 - Start Backend Service in visible window
REM ============================================
echo [1/3] Starting Backend Service in Docker...
start "ScholarMind Backend (Docker)" cmd /k ""%ROOT_DIR%start_backend_docker.bat""

REM ============================================
REM 2/3 - Start Desktop Client in hidden window
REM ============================================
echo [2/3] Starting Desktop Client and browser in background...
start "" /min cmd /c ""%ROOT_DIR%open_desktop_web_docker.bat""

REM ============================================
REM 3/3 - Start Cloudflare Tunnel
REM ============================================
echo [3/3] Starting Cloudflare Tunnel...
echo.

where cloudflared >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "ScholarMind Tunnel" cmd /k "title ScholarMind Tunnel && chcp 65001>nul && cd /d ""%BACKEND_DIR%"" && start_tunnel.bat"
    goto :success
)

where npx >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "ScholarMind Tunnel" cmd /k "title ScholarMind Tunnel && chcp 65001>nul && cd /d ""%BACKEND_DIR%"" && npx cloudflared tunnel --url http://127.0.0.1:8000"
    goto :success
)

echo [WARNING] cloudflared not found!
echo.
echo To use Cloudflare Tunnel, install it with:
echo   winget install Cloudflare.cloudflared
echo.
echo Or use:
echo   npx cloudflared tunnel --url http://127.0.0.1:8000
echo.

:success
cls
echo ========================================
echo   ScholarMind - Docker Services Started
echo ========================================
echo.
echo [RUNNING SERVICES]
echo.
echo   Backend API:     http://localhost:8000
echo   Desktop Client:  %FRONTEND_URL%
echo.
echo [PUBLIC ACCESS]
echo.
echo   Use the tunnel URL shown in the
echo   ScholarMind Tunnel window.
echo.
echo [ADDITIONAL]
echo.
echo   Frontend URL:    %FRONTEND_URL%
echo   Frontend Log:    %ROOT_DIR%tmp\frontend-docker.log
echo.
echo   Press any key to close this window...
echo   (Services will continue running)
echo ========================================
echo.

timeout /t 10 /nobreak > nul
pause
exit /b 0

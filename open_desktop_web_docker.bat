@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "TMP_DIR=%ROOT_DIR%tmp"
set "FRONTEND_LOG=%TMP_DIR%\frontend-docker.log"
set "START_LOG=%TMP_DIR%\open_desktop_web_docker.log"
set "WAIT_SCRIPT=%ROOT_DIR%scripts\wait_http_ok.ps1"
set "BACKEND_URL=http://127.0.0.1:8000/api/health"
set "FRONTEND_URL=http://127.0.0.1:5173"

cd /d "%ROOT_DIR%"

if not exist "%TMP_DIR%" mkdir "%TMP_DIR%" >nul 2>nul
type nul > "%FRONTEND_LOG%"
type nul > "%START_LOG%"

echo [%date% %time%] waiting for backend >> "%START_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%WAIT_SCRIPT%" -Url "%BACKEND_URL%" -TimeoutSeconds 300
if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] backend timeout >> "%START_LOG%"
    exit /b 1
)

echo [%date% %time%] starting web container >> "%START_LOG%"
docker compose up -d --no-deps --force-recreate web >> "%FRONTEND_LOG%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] first web start failed, retrying after removing container >> "%START_LOG%"
    docker rm -f scholarmind-web-1 >nul 2>nul
    docker compose up -d --no-deps --force-recreate web >> "%FRONTEND_LOG%" 2>&1
)

if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] web start failed >> "%START_LOG%"
    exit /b 1
)

echo [%date% %time%] waiting for web >> "%START_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%WAIT_SCRIPT%" -Url "%FRONTEND_URL%" -TimeoutSeconds 300
if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] web timeout >> "%START_LOG%"
    exit /b 1
)

echo [%date% %time%] opening browser >> "%START_LOG%"
explorer.exe "%FRONTEND_URL%"
exit /b 0

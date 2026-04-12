@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "TMP_DIR=%ROOT_DIR%tmp"
set "FRONTEND_LOG=%TMP_DIR%\frontend-docker.log"
set "START_LOG=%TMP_DIR%\open_desktop_web_docker.log"
set "BACKEND_URL=http://localhost:8000/api/health"
set "FRONTEND_URL=http://localhost:5173"

cd /d "%ROOT_DIR%"

if not exist "%TMP_DIR%" mkdir "%TMP_DIR%" >nul 2>nul
type nul > "%FRONTEND_LOG%"
type nul > "%START_LOG%"

echo [%date% %time%] waiting for backend >> "%START_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = '%BACKEND_URL%'; $deadline = (Get-Date).AddMinutes(5); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3; if ($response.StatusCode -eq 200) { exit 0 } } catch { }; Start-Sleep -Seconds 2 }; exit 1"
if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] backend timeout >> "%START_LOG%"
    exit /b 1
)

echo [%date% %time%] starting hidden web process >> "%START_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$rootDir = [System.IO.Path]::GetFullPath('%ROOT_DIR%'); $logPath = [System.IO.Path]::GetFullPath('%FRONTEND_LOG%'); $command = 'Set-Location -LiteralPath ''' + $rootDir + '''; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; docker compose rm -f -s web *> $null; docker compose up -d --force-recreate web *>> ''' + $logPath + ''''; Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) -WorkingDirectory $rootDir -WindowStyle Hidden"

echo [%date% %time%] waiting for web >> "%START_LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url = '%FRONTEND_URL%'; $deadline = (Get-Date).AddMinutes(5); while ((Get-Date) -lt $deadline) { try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3; if ($response.StatusCode -eq 200) { exit 0 } } catch { }; Start-Sleep -Seconds 2 }; exit 1"

echo [%date% %time%] opening browser >> "%START_LOG%"
explorer.exe "%FRONTEND_URL%"
exit /b 0

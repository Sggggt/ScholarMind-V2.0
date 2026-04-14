@echo off
setlocal

set "BACKEND_DIR=%~dp0"
set "LAN_IP_SCRIPT=%BACKEND_DIR%..\scripts\detect_host_lan_ips.ps1"
set "VENV_ACTIVATE=%BACKEND_DIR%venv\Scripts\activate.bat"
set "VENV_PYTHON=%BACKEND_DIR%venv\Scripts\python.exe"

title ScholarMind Backend Logs
chcp 65001>nul
cd /d "%BACKEND_DIR%"

if exist "%LAN_IP_SCRIPT%" (
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%LAN_IP_SCRIPT%"`) do set "HOST_LAN_IPS=%%I"
)
if defined HOST_LAN_IPS (
    echo [backend] detected LAN IPs: %HOST_LAN_IPS%
)

if exist "%VENV_PYTHON%" (
    call "%VENV_ACTIVATE%"
    echo [backend] virtualenv activated: %VENV_ACTIVATE%
    "%VENV_PYTHON%" -m main
) else (
    echo [backend] virtualenv not found, falling back to system Python
    python -m main
)

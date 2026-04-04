@echo off
setlocal

set "BACKEND_DIR=%~dp0"
set "VENV_ACTIVATE=%BACKEND_DIR%venv\Scripts\activate.bat"
set "VENV_PYTHON=%BACKEND_DIR%venv\Scripts\python.exe"

title ScholarMind Backend Logs
chcp 65001>nul
cd /d "%BACKEND_DIR%"

if exist "%VENV_PYTHON%" (
    call "%VENV_ACTIVATE%"
    echo [backend] virtualenv activated: %VENV_ACTIVATE%
    "%VENV_PYTHON%" -m main
) else (
    echo [backend] virtualenv not found, falling back to system Python
    python -m main
)

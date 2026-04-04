@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%react-client"
set "BACKEND_START_SCRIPT=%BACKEND_DIR%\start_backend.bat"

echo ========================================
echo ScholarMind - Starting All Services
echo ========================================
echo.
echo [1/2] Launching backend in a dedicated log window...
if exist "%BACKEND_START_SCRIPT%" (
    start "ScholarMind Backend Logs" cmd /k ""%BACKEND_START_SCRIPT%""
) else (
    start "ScholarMind Backend Logs" cmd /k "title ScholarMind Backend Logs && chcp 65001>nul && cd /d ""%BACKEND_DIR%"" && echo [backend] virtualenv not found, falling back to system Python && python -m main"
)

timeout /t 3 /nobreak > nul

echo [2/2] Launching frontend in a separate window...
start "ScholarMind Frontend" cmd /k "title ScholarMind Frontend && chcp 65001>nul && cd /d ""%FRONTEND_DIR%"" && npm run dev"

echo.
echo ========================================
echo Services started in separate windows.
echo Backend logs: dedicated backend command window
echo Backend API:  http://localhost:8000
echo Frontend UI:  http://localhost:5173
echo ========================================

timeout /t 3 /nobreak > nul

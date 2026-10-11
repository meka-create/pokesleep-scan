@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 development\start_local.py
) else (
  python development\start_local.py
)
if errorlevel 1 (
  echo.
  echo Python 3 is required to start the local OCR development server.
)
pause

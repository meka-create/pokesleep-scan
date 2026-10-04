@echo off
setlocal
cd /d "%~dp0"
set PORT=8019
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  py -m http.server %PORT%
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  npx --yes serve -l %PORT% .
  goto :eof
)
echo.
echo Python or Node.js was not found.
echo PaddleOCR needs HTTP(S). Please host this folder with any local web server or GitHub Pages.
echo Tesseract-only testing can still be done by opening index.html directly.
echo.
pause

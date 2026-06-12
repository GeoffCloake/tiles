@echo off
setlocal

set PORT=8080
set URL=http://localhost:%PORT%

echo Starting local server on %URL%
echo Press Ctrl+C to stop.
echo.

REM Try Python first
python --version >nul 2>&1
if %errorlevel% == 0 (
    start "" %URL%
    python -m http.server %PORT%
    goto :done
)

REM Try Python 3 explicitly (some installs use 'python3')
python3 --version >nul 2>&1
if %errorlevel% == 0 (
    start "" %URL%
    python3 -m http.server %PORT%
    goto :done
)

REM Try Node.js / npx
node --version >nul 2>&1
if %errorlevel% == 0 (
    start "" %URL%
    npx --yes http-server -p %PORT% -c-1
    goto :done
)

echo ERROR: No suitable server found.
echo Install Python (https://python.org) or Node.js (https://nodejs.org) and try again.
pause

:done
endlocal

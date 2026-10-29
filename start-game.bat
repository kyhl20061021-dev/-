@echo off
setlocal
cd /d "%~dp0"
title Ferryman - local server

if not exist "dist\index.html" (
  echo Building dist for the first time, please wait...
  call npx vite build
  if errorlevel 1 (
    echo Build failed. Install deps first: npm install
    pause
    exit /b 1
  )
)

rem Server already listening? Then just open the browser.
netstat -ano | findstr /c:"127.0.0.1:5180" | findstr LISTENING >nul
if not errorlevel 1 goto open

echo Starting local server on http://127.0.0.1:5180/ ...
start "" /min cmd /c "npx vite preview --host 127.0.0.1 --port 5180 --strictPort"
timeout /t 5 /nobreak >nul

:open
start "" "http://127.0.0.1:5180/"
exit /b 0

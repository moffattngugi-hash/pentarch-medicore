@echo off
title Pentarch MediCore
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed on this computer.
  echo  Install Node.js 22 LTS from https://nodejs.org and then double-click this file again.
  echo.
  pause
  exit /b
)
set /p V=<version.txt
set IV=none
if exist .installed-version set /p IV=<.installed-version
if not "%V%"=="%IV%" (
  echo.
  echo  Installing Pentarch MediCore %V%. This needs internet and takes a few minutes...
  echo.
  call npm run setup
  if errorlevel 1 (
    echo.
    echo  Setup did not finish. Check the internet connection and double-click this file again.
    pause
    exit /b
  )
  >.installed-version echo %V%
)
echo.
echo  Pentarch MediCore %V% is starting. Keep this window open while the system is in use.
echo.
start "" http://localhost:4000
npm start

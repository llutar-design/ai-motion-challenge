@echo off
REM Kiosk mode (no browser UI). Exit with Alt+F4 or the exit button.
cd /d "%~dp0.."
title AI MOTION CHALLENGE server (kiosk)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\server\serve.ps1" -Port 8770 -Kiosk
if errorlevel 1 pause

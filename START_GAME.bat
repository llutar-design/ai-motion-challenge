@echo off
REM AI MOTION CHALLENGE - double-click to start (local server 127.0.0.1 only + full screen)
cd /d "%~dp0"
title AI MOTION CHALLENGE server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\serve.ps1" -Port 8770
if errorlevel 1 pause

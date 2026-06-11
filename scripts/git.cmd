@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0git.ps1" %*
exit /b %ERRORLEVEL%

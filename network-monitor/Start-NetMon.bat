@echo off
setlocal EnableExtensions
title NetMon GUI Launcher
cd /d "%~dp0"

set "SCRIPT=%~dp0netmon-gui.py"

rem ---------- 1) make sure the app file exists ----------
if not exist "%SCRIPT%" (
    echo [1/3] netmon-gui.py not found - downloading it ...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/aminchat/amin/arena/01a0292a-amin/network-monitor/netmon-gui.py' -OutFile '%SCRIPT%'"
)

rem ---------- 2) find Python automatically ----------
echo [2/3] Looking for Python ...
set "PYEXE="
for /f "delims=" %%i in ('where py 2^>nul') do if not defined PYEXE set "PYEXE=%%i"
for /f "delims=" %%i in ('where python 2^>nul ^| findstr /v /i "WindowsApps"') do if not defined PYEXE set "PYEXE=%%i"
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do if not defined PYEXE if exist "%%D\python.exe" set "PYEXE=%%D\python.exe"
for /d %%D in ("C:\Program Files\Python*") do if not defined PYEXE if exist "%%D\python.exe" set "PYEXE=%%D\python.exe"
for /d %%D in ("%USERPROFILE%\PycharmProjects\*") do if not defined PYEXE if exist "%%D\.venv\Scripts\python.exe" set "PYEXE=%%D\.venv\Scripts\python.exe"

if not defined PYEXE (
    echo.
    echo   ERROR: Python not found!
    echo   Install it from python.org and tick "Add python.exe to PATH"
    echo.
    pause
    exit /b 1
)
echo       Found: %PYEXE%

rem ---------- 3) admin rights (needed for block / kill) ----------
net session >nul 2>&1
if errorlevel 1 (
    echo [3/3] Asking for Administrator rights - click YES on the UAC window ...
    powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
    exit /b
)

echo [3/3] Starting NetMon GUI ...
echo       Keep this window OPEN. To stop NetMon close this window or press Ctrl+C.
echo.
"%PYEXE%" "%SCRIPT%"
echo.
echo NetMon stopped.
pause

@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing_node
node -e "if (process.versions.node.split('.')[0] !== '24') { console.error('This project needs Node.js 24. Install it from https://nodejs.org/en/download and run this file again.'); process.exit(1); }"
if errorlevel 1 goto failed
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_node
echo Installing the project dependencies. The first installation needs internet access.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
call npm.cmd run setup
if errorlevel 1 goto failed
echo.
echo Keep this window open. Open the address printed when the server is ready.
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Install Node.js 24 from https://nodejs.org/en/download first, then run this file again.
goto failed
:failed
echo.
echo The project could not start. Read the error above and docs\LOCAL-SETUP.md.
echo If port 8000 is busy, stop the old project window with Ctrl+C and try again.
pause
exit /b 1

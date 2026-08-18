@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo RHBurnerPass v0.2 - verify hardening update
echo ==============================================
call npm install
if errorlevel 1 goto :fail
call npm run contracts:compile
if errorlevel 1 goto :fail
call npm test
if errorlevel 1 goto :fail
call npm run build
if errorlevel 1 goto :fail
echo.
echo SUCCESS - contracts, tests, and frontend build passed.
echo Next testnet migration command: npm run harden:testnet
exit /b 0
:fail
echo.
echo FAILED - review the error above. No deployment was attempted by this script.
exit /b 1

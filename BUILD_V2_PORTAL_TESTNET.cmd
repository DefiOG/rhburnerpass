@echo off
setlocal
cd /d "%~dp0"
echo Building RHBurnerPass v2 testnet portal...
call npx tsc -b
if errorlevel 1 exit /b %errorlevel%
call npx vite build --mode v2testnet
endlocal

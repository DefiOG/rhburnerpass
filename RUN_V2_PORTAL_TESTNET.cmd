@echo off
setlocal
cd /d "%~dp0"
echo Starting RHBurnerPass v2 testnet portal...
call npx vite --mode v2testnet
endlocal

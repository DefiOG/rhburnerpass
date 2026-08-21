@echo off
setlocal
cd /d "%~dp0"
node --env-file=.env scripts\verify-v2-mint-source-testnet.mjs %*
if errorlevel 1 (
  echo.
  echo Verification failed. Review the error above.
  exit /b 1
)
endlocal

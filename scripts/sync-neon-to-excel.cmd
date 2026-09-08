@echo off

cd /d "C:\Users\Administrator\OneDrive\Desktop\JS Dev Studio\JS Dev Solution\Site Rescue Studio"

echo ========================================
echo SITE RESCUE STUDIO
echo AUTOMATIC NEON - EXCEL SYNC
echo ========================================
echo.
echo Started: %date% %time%
echo.

call npm run sync:excel:scheduled

echo.
echo Finished: %date% %time%
echo.

if errorlevel 1 (
    echo SYNC FAILED.
    exit /b 1
)

echo SYNC SUCCESSFUL.
exit /b 0
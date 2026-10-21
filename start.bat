@echo off
rem Double-click this file to start the gym app (database + API + web).
cd /d "%~dp0"
echo Starting the local database...
call npm run db:start
if errorlevel 1 goto :error
echo.
echo Starting the API and web app... Press Ctrl+C to stop.
call npm run dev
goto :eof

:error
echo.
echo Could not start the database. Check .tools\mariadb.err.log
pause

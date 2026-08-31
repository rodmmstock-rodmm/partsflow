@echo off
setlocal
cd /d "%~dp0"
if not exist "data\partsflow_local.sqlite3" (
  echo ไม่พบฐานข้อมูล Local ที่ data\partsflow_local.sqlite3
  pause
  exit /b 1
)
if not exist "backups" mkdir "backups"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
copy /y "data\partsflow_local.sqlite3" "backups\partsflow_local_%TS%.sqlite3" >nul
if errorlevel 1 (
  echo Backup ไม่สำเร็จ
  pause
  exit /b 1
)
echo Backup สำเร็จ: backups\partsflow_local_%TS%.sqlite3
pause

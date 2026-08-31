@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
if not exist "backups" (
  echo ไม่พบโฟลเดอร์ backups
  pause
  exit /b 1
)
set LATEST=
for /f "delims=" %%F in ('dir /b /a-d /o-d "backups\partsflow_local_*.sqlite3" 2^>nul') do (
  if not defined LATEST set "LATEST=%%F"
)
if not defined LATEST (
  echo ไม่พบไฟล์ Backup ในโฟลเดอร์ backups
  pause
  exit /b 1
)
echo จะ Restore จาก: backups\!LATEST!
echo กรุณาปิด PartsFlowLocal.exe ก่อนทำต่อ
choice /M "ยืนยัน Restore"
if errorlevel 2 exit /b 0
if exist "data\partsflow_local.sqlite3" (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
  copy /y "data\partsflow_local.sqlite3" "backups\before_restore_!TS!.sqlite3" >nul
)
if not exist "data" mkdir "data"
copy /y "backups\!LATEST!" "data\partsflow_local.sqlite3" >nul
if errorlevel 1 (
  echo Restore ไม่สำเร็จ
  pause
  exit /b 1
)
echo Restore สำเร็จ
pause

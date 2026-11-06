@echo off
rem "Iniciar servidor IntegrAlo" (Start menu). Starts the IntegrAlo service if it is stopped and
rem opens the server panel when it answers. Starting a service needs administrator rights: only
rem that step runs elevated (a UAC prompt); the panel opens as the user, not as administrator.
setlocal
chcp 65001 >nul
title IntegrAlo
set "SERVICE=%~dp0IntegrAlo-service.exe"
set "PANEL=http://127.0.0.1:4101"
if "%~1"=="/servicio" goto service

sc query IntegrAlo | find "RUNNING" >nul && goto open
echo Iniciando el servidor IntegrAlo...
echo Windows pedirá permiso de administrador para iniciar el servicio.
net session >nul 2>&1
if not errorlevel 1 (
  call :service
) else (
  powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '/servicio' -Verb RunAs -Wait -WindowStyle Hidden } catch { exit 1 }"
  if errorlevel 1 (
    echo.
    echo No se concedió el permiso: el servidor sigue detenido.
    pause
    exit /b 1
  )
)

echo Esperando a que el servidor responda...
for /l %%i in (1,1,60) do (
  curl.exe -s -f -o nul "%PANEL%" && goto open
  timeout /t 1 /nobreak >nul
)
echo.
echo El servidor no respondió en 60 segundos.
echo Sus registros están en %ProgramData%\IntegrAlo\logs (solo para administradores).
pause
exit /b 1

:open
start "" "%PANEL%"
exit /b 0

:service
"%SERVICE%" start >nul 2>&1
exit /b

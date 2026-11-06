@echo off
rem "Detener servidor IntegrAlo" (Start menu). Stops the IntegrAlo service in order (the
rem supervisor stops the core and then the broker). Needs administrator rights (a UAC prompt).
setlocal
chcp 65001 >nul
title IntegrAlo
set "SERVICE=%~dp0IntegrAlo-service.exe"
if "%~1"=="/servicio" goto service

sc query IntegrAlo | find "STOPPED" >nul && (
  echo El servidor IntegrAlo ya está detenido.
  timeout /t 5 >nul
  exit /b 0
)
echo Deteniendo el servidor IntegrAlo (núcleo y broker, en orden)...
echo Windows pedirá permiso de administrador para detener el servicio.
net session >nul 2>&1
if not errorlevel 1 (
  call :service
) else (
  powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '/servicio' -Verb RunAs -Wait -WindowStyle Hidden } catch { exit 1 }"
  if errorlevel 1 (
    echo.
    echo No se concedió el permiso: el servidor sigue en marcha.
    pause
    exit /b 1
  )
)

sc query IntegrAlo | find "STOPPED" >nul && (
  echo Servidor detenido. Para volver a usarlo: menú Inicio, "Iniciar servidor IntegrAlo".
  timeout /t 5 >nul
  exit /b 0
)
echo No se pudo detener el servidor. Pruebe desde Servicios de Windows (services.msc).
pause
exit /b 1

:service
"%SERVICE%" stopwait >nul 2>&1
exit /b

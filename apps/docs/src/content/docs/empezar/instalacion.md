---
title: Instalación
description: Cómo instalar el servidor de IntegrAlo en Windows.
sidebar:
  order: 2
---

El servidor se instala en un equipo Windows de la red local y queda como servicio de inicio
automático.

## Requisitos

- Windows y permisos de administrador.
- Los puertos 4100 (app) y 1883 (nodos) libres.

## Pasos

1. Descarga el instalador desde [Descargas](../../descargas/).
2. Ejecútalo como administrador y sigue el asistente.

## Qué hace el instalador

- Copia el programa en `Program Files\IntegrAlo` y deja los datos en `%ProgramData%\IntegrAlo`,
  accesibles solo para el sistema y los administradores.
- Abre en el firewall los puertos 4100 y 1883 en redes privadas y de dominio, y en redes públicas
  solo si lo marcas.
- Si ya existe el servicio Mosquitto de Windows, ofrece detenerlo, porque usa el mismo puerto.
- Registra e inicia el servicio `IntegrAlo`.
- Crea en el menú Inicio, carpeta IntegrAlo, tres accesos: **Panel del servidor IntegrAlo**,
  **Iniciar servidor IntegrAlo** y **Detener servidor IntegrAlo**. Los dos últimos también pueden
  crearse en el escritorio.

## Comprobar que funciona

Abre **Panel del servidor IntegrAlo** desde el menú Inicio. También puedes consultar el servicio
desde PowerShell:

```powershell
Get-Service IntegrAlo
```

## Desinstalar

Desinstala IntegrAlo desde la configuración de Windows. Los datos se conservan, salvo que pidas
borrarlos durante la desinstalación.

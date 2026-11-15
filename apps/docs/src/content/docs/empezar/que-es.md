---
title: Qué es IntegrAlo
description: Una plataforma modular local para supervisión y control.
sidebar:
  order: 1
---

IntegrAlo es una plataforma modular para supervisar y controlar equipos desde una red local. Se
compone de:

- **El servidor**, que se instala en un equipo Windows y queda funcionando como servicio. Incluye
  el núcleo de la plataforma y el broker MQTT al que se conectan los nodos.
- **La app**, que se usa desde el navegador o desde un teléfono Android.
- **Los nodos**, placas ESP32 que miden, envían sus lecturas y ejecutan las órdenes que reciben.
- **Los módulos**, que definen qué supervisa y controla la plataforma. El primero es el módulo de
  temperatura de una habitación con climatización.

Todo funciona dentro de la red local, sin servicios externos.

## Siguiente paso

Instala el servidor siguiendo la [guía de instalación](../instalacion/).

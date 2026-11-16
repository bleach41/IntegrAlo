# Firmware del nodo

Firmware en C++ del nodo de temperatura. Está escrito en dos capas, y así el mismo código se prueba en el PC antes de tener la placa (*software-in-the-loop*) y después corre en el ESP32.

| Capa | Carpeta | Qué hace | Depende de |
|---|---|---|---|
| Núcleo portable | `src/core` | Modelo térmico, histéresis, PI sin saltos, estado y su validación, órdenes con confirmación y duplicados, esqueleto MQTT (anuncio, estado, telemetría, Last Will, reconexión) | Solo C++17 y ArduinoJson |
| Plataforma PC | `src/pc` | MQTT con libmosquitto (viene con Mosquitto), memoria en archivos, línea de órdenes | Windows, Mosquitto |
| Plataforma ESP32 | `src/esp32` (compila; aún sin probar en una placa) | Wi-Fi, portal de configuración, MQTT con esp-mqtt, memoria no volátil (Preferences/NVS), identidad por MAC, LED de estado y botón BOOT | Núcleo Arduino-ESP32 3.x |

El núcleo no sabe en qué máquina corre. Lo que necesita de ella se resume en tres interfaces de `src/core/platform.h`:

- `MqttTransport`: conectar, publicar, suscribirse y `loop()`.
- `StateStorage`: guardar y leer el estado sin dejarlo a medias si se va la corriente.
- `Logger`: los mensajes del registro.

Cada plataforma las implementa. Con la placa solo cambia esa capa delgada.

## Equivalencia con el nodo simulado

El núcleo reproduce la lógica de `apps/sim-node` (TypeScript) archivo por archivo:

| Firmware | Nodo simulado |
|---|---|
| `core/room_model.h` | `model/room.ts` |
| `core/controllers.h` | `control/hysteresis.ts`, `control/pi.ts` |
| `core/temperature_node.h` | `node/simulation.ts`, `control/controller.ts`, `model/disturbance.ts`, `node/temperature-behaviour.ts` |
| `core/node_state.*` | `node/state.ts` y los esquemas de `modules/temperature` |
| `core/command_handler.*` | `node/command-handler.ts` |
| `core/node_app.*` | `node/mqtt-node.ts` |

La equivalencia se comprueba de tres formas:

1. **Pruebas unitarias** (`test/test_core.cpp`): las mismas comprobaciones que las pruebas del nodo simulado.
2. **Prueba de extremo a extremo**: la misma prueba del nodo simulado (`apps/sim-node/src/e2e/run.ts`), ejecutada contra el firmware con `INTEGRALO_E2E_NODE_EXE`. Cubre identificación, telemetría, órdenes, duplicados, rechazos, Last Will y recuperación del estado tras un reinicio.
3. **Simulación sin red** (`integralo-fw-simulate`): tiene las mismas opciones y el mismo CSV que `pnpm simulate`, así que los archivos de ambas implementaciones se comparan línea por línea.

### Resultados (15/11/2026, GCC 16.2 de WinLibs, libmosquitto 2.1.2)

| Verificación | Resultado |
|---|---|
| Pruebas unitarias del núcleo | 52/52 comprobaciones |
| Prueba de extremo a extremo del nodo (`apps/sim-node`, `pnpm e2e`) | 12/12, igual que el nodo simulado |
| Prueba de extremo a extremo de la plataforma (`apps/server`, `pnpm e2e`), con el firmware como nodo de temperatura | 74/74: registro y aprobación, telemetría guardada, órdenes confirmadas, rechazadas y sin confirmar, alarmas, estado de conexión |
| CSV de `integralo-fw-simulate` frente a `pnpm simulate` | Idénticos byte a byte en 9 escenarios: lazo abierto, histéresis, PI, escalón exterior, perfil diario, ×60, banda estrecha |
| CSV frente a los ya validados con MATLAB y Scilab (`Tesis/trabajo/simulaciones/datos`) | Idénticos byte a byte: S1, S3, S4 (4 h), S5 y S6 |

Hallazgo de la verificación: ArduinoJson guarda los decimales cortos en precisión simple para ahorrar memoria. Sin corrección, una consigna de 23,3 °C volvería a la plataforma como 23,29999924 y un Ki de 0,05 como 0,049999997. `jsonNumber()` (`core/node_state.h`) recupera el decimal escrito. En el ESP32 ocurriría lo mismo, así que la corrección forma parte del núcleo.

## Compilar y probar en el PC

Requisitos:

- GCC portable de WinLibs, descomprimido en `.tools\mingw64`.
- Mosquitto instalado en `C:\Program Files\mosquitto`, porque se usa su `libmosquitto`.

```powershell
.\firmware\scripts\build.ps1 -Test
```

Pruebas de extremo a extremo contra el firmware (antes, `pnpm build`):

```powershell
$env:INTEGRALO_E2E_NODE_EXE = "$PWD\firmware\build\integralo-fw-pc.exe"
pnpm --filter @integralo/sim-node e2e
pnpm --filter @integralo/server e2e
```

Conectar el firmware a la plataforma en marcha, como un nodo más:

```powershell
.\firmware\build\integralo-fw-pc.exe --settings .data\settings.json --time-scale 60
```

El nodo aparece en la plataforma como `fw-xxxxxx`. Ese identificador se sortea la primera vez y se guarda en `.state-fw`; en el ESP32 saldrá de su MAC.

## Compilar y grabar el ESP32

Hacen falta `arduino-cli` (en `.tools\arduino-cli` o en el PATH) y el núcleo Arduino-ESP32 3.x (`arduino-cli core install esp32:esp32`).

```powershell
.\firmware\scripts\build-esp32.ps1                # solo compilar
.\firmware\scripts\build-esp32.ps1 -Port COM5     # compilar y grabar la placa
```

El script arma en `build\esp32\IntegrAlo` un *sketch* de Arduino con `src/core` y `src/esp32`. Así los dos destinos usan siempre los mismos archivos del núcleo. Esa carpeta también se puede abrir en el Arduino IDE, instalando allí ArduinoJson 7.4.3. Tras grabar, el Monitor Serie a 115200 baudios muestra el registro.

Probado el 16/11 con arduino-cli 1.5.1 y el núcleo 3.3.12, placa «ESP32 Dev Module»: compila sin avisos. El programa ocupa 1 118 936 bytes, el 85 % de los 1,25 MB que la tabla de particiones por defecto reserva para la aplicación, y las variables globales usan 48 KB de RAM (14 %). Si en el futuro no cabe, se puede pasar a una tabla de particiones con más espacio para la aplicación (`--fqbn esp32:esp32:esp32:PartitionScheme=huge_app`), a costa de perder la actualización por red (OTA), que hoy no se usa.

## Decisiones

- **ArduinoJson 7.4.3** está incluido en `lib/ArduinoJson` (licencia MIT): el PC y el ESP32 usan la misma copia.
- **El PI guarda el término integral en %**, así que cambiar Kp o Ki no provoca saltos (véase `GUIA_SIMULACIONES.md`, sección 8).
- **Identidad:** `fw-` más 6 cifras hexadecimales en el PC, `esp32-` más los 6 últimos dígitos de la MAC en la placa.
- **Puesta en marcha del ESP32 con un portal de configuración** (elegido por Tony el 16/11, en la línea de «todo en uno»). No hay datos escritos en el código (`src/esp32/provisioning.*`). El flujo:
  1. Se graba el firmware por USB una sola vez.
  2. Si la placa no tiene configuración, crea su propia red Wi-Fi abierta `IntegrAlo-xxxxxx` (final de la MAC). La red solo existe mientras dura la configuración.
  3. El móvil se conecta a esa red y se abre solo una página (portal cautivo, como en Shelly o Sonoff).
  4. En la página se elige la red Wi-Fi de una lista ordenada por señal (o se escribe una red oculta), se escribe su contraseña y se indican la dirección del servidor, el puerto y la cuenta de los nodos del panel.
  5. La placa guarda esos datos en su memoria no volátil (NVS, espacio `integralo-cfg`, aparte del estado de control) y se reinicia. Después se conecta y aparece en la app pendiente de aprobación.
  6. **Primera conexión vigilada.** Mientras la configuración es nueva, un fallo claro vuelve a abrir el portal con el motivo escrito. Los fallos vigilados son tres: Wi-Fi sin conexión en 30 s (contraseña), cuenta rechazada por el broker y servidor no encontrado en 60 s. Tras la primera conexión correcta, los fallos solo se reintentan. Así, tras un corte de corriente, un router que tarda más en arrancar que la placa nunca la devuelve al portal. Un portal abierto por un fallo se cierra a los 5 min y la placa vuelve a intentarlo.
  7. **Reconfigurar:** mantener pulsado BOOT 5 s con la placa en marcha. Borra la configuración de red (conserva consigna, modo y ganancias), publica `offline` y abre el portal. No debe pulsarse BOOT al encender: así el ESP32 entra en modo de grabación.
  8. **LED de la placa:** parpadeo lento = portal abierto; parpadeo rápido = conectando; fijo = conectado.

  Riesgo aceptado: la red del portal va abierta durante la configuración, como en los equipos comerciales. Mejoras previstas para quitar campos: que la placa encuentre sola el servidor (`integralo.local`) y que la configure la propia app.
- **Cliente MQTT del ESP32: esp-mqtt** (decidido por Tony el 16/11). PubSubClient, la librería prevista en los requisitos, solo publica con QoS 0, pero el contrato pide QoS 1 para `announce`, `status` y `ack`. `esp-mqtt` es de Espressif y viene en el núcleo Arduino-ESP32; publica con QoS 1, tiene Last Will y reconecta solo cada 2 s. Corre en su propia tarea de FreeRTOS, así que `EspMqttTransport` encola los mensajes y los entrega al núcleo desde `loop()`. Así el núcleo sigue funcionando en un solo hilo, como en el PC.
- **Temperatura simulada también en la placa:** el ESP32 ejecuta el mismo modelo de habitación, como permite el alcance de la tesis. Un sensor real sería otra implementación de la lectura, sin tocar el resto.

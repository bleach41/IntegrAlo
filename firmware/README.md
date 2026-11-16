# Firmware del nodo

Firmware en C++ del nodo de temperatura. Está escrito en dos capas, y así el mismo código se prueba en el PC antes de tener la placa (*software-in-the-loop*) y después corre en el ESP32.

| Capa | Carpeta | Qué hace | Depende de |
|---|---|---|---|
| Núcleo portable | `src/core` | Modelo térmico, histéresis, PI sin saltos, estado y su validación, órdenes con confirmación y duplicados, esqueleto MQTT (anuncio, estado, telemetría, Last Will, reconexión) | Solo C++17 y ArduinoJson |
| Plataforma PC | `src/pc` | MQTT con libmosquitto (viene con Mosquitto), memoria en archivos, línea de órdenes | Windows, Mosquitto |
| Plataforma ESP32 | `src/esp32` (pendiente) | Wi-Fi, cliente MQTT, memoria no volátil (Preferences), identidad por MAC | Núcleo Arduino-ESP32 |

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

## Decisiones

- **ArduinoJson 7.4.3** está incluido en `lib/ArduinoJson` (licencia MIT): el PC y el ESP32 usan la misma copia.
- **El PI guarda el término integral en %**, así que cambiar Kp o Ki no provoca saltos (véase `GUIA_SIMULACIONES.md`, sección 8).
- **Identidad:** `fw-` más 6 cifras hexadecimales en el PC, `esp32-` más los 6 últimos dígitos de la MAC en la placa.
- **Cliente MQTT del ESP32, pendiente de decidir.** PubSubClient, la librería prevista en los requisitos, solo publica con QoS 0, pero el contrato pide QoS 1 para `announce`, `status` y `ack`. El cliente `esp-mqtt` que trae el núcleo Arduino-ESP32 sí publica con QoS 1, tiene Last Will y reconecta solo. Como el núcleo solo ve la interfaz `MqttTransport`, elegir uno u otro no lo cambia.

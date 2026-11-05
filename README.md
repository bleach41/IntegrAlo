# IntegrAlo

Plataforma modular local para supervisión y control. Caso de estudio: módulo de temperatura de una habitación con climatización, con nodos ESP32 conectados por MQTT.

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/contract` | Contrato compartido: manifiesto de módulo, mensajes y temas MQTT, con validación en tiempo de ejecución |
| `modules/temperature` | Manifiesto del módulo de temperatura |

## Requisitos

- Node.js 22
- pnpm 9
- Mosquitto como servicio local (puerto 1883)

## Uso

```bash
pnpm install
pnpm build
pnpm check:manifests
```

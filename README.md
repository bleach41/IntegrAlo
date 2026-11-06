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

## Paquete autónomo

```bash
pnpm build
pnpm package
```

Genera `release/IntegrAlo`: Node.js, Mosquitto, el supervisor, el núcleo, la versión web y los manifiestos, sin depender del monorepo ni de programas instalados. `IntegrAlo.cmd` lo arranca con los datos en `%ProgramData%\IntegrAlo`. La misma prueba extremo a extremo del supervisor se ejecuta contra el paquete con:

```bash
INTEGRALO_E2E_PACKAGE=release/IntegrAlo pnpm --filter @integralo/supervisor e2e
```

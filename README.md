# IntegrAlo

Plataforma modular local para supervisión y control. Caso de estudio: módulo de temperatura de una habitación con climatización, con nodos ESP32 conectados por MQTT.

## Estructura

| Carpeta | Contenido |
|---|---|
| `packages/contract` | Contrato compartido: manifiesto de módulo, mensajes y temas MQTT, con validación en tiempo de ejecución |
| `modules/temperature` | Manifiesto del módulo de temperatura |

Documentación y descargas: sitio en `apps/docs` (Astro + Starlight), publicado en GitHub Pages.

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
pnpm --filter @integralo/client export:web
pnpm package
```

`export:web` exporta la versión web a `apps/client/dist` y copia antes el lector de QR (`zxing_reader.wasm`), para que la web no lo descargue de Internet. Genera `release/IntegrAlo`: Node.js, Mosquitto, el supervisor, el núcleo, la versión web y los manifiestos, sin depender del monorepo ni de programas instalados. `IntegrAlo.cmd` lo arranca con los datos en `%ProgramData%\IntegrAlo`. La misma prueba extremo a extremo del supervisor se ejecuta contra el paquete (la ruta debe ser absoluta, porque la prueba corre desde `apps/supervisor`) con:

```bash
INTEGRALO_E2E_PACKAGE="$(pwd -W)/release/IntegrAlo" pnpm --filter @integralo/supervisor e2e
```

## Servicio de Windows e instalador

Herramientas, fuera del repositorio, en `.tools/`: WinSW 2.12.0 (`.tools/downloads/WinSW.NET461.exe` y su `WinSW-LICENSE.txt`) e Inno Setup 6 (`.tools/InnoSetup`).

```bash
pnpm installer
```

Genera el paquete y `release/IntegrAlo-Setup-<versión>.exe`. El instalador, ejecutado como administrador:

- copia el programa en `Program Files\IntegrAlo` y deja los datos en `%ProgramData%\IntegrAlo`, solo accesibles para el sistema y los administradores;
- abre en el firewall los puertos 4100 (app) y 1883 (nodos) en redes privadas y de dominio, y en públicas solo si se marca;
- ofrece detener el servicio Mosquitto de Windows si ya existe;
- registra e inicia el servicio `IntegrAlo`, de inicio automático;
- deja en el menú Inicio, carpeta IntegrAlo, tres accesos: «Panel del servidor IntegrAlo», «Iniciar servidor IntegrAlo» (inicia el servicio si está detenido y abre el panel) y «Detener servidor IntegrAlo» (parada ordenada). Iniciar y detener piden permiso de administrador solo para ese paso. Opcionalmente (marcado por defecto) crea los dos últimos también en el escritorio.

Los iconos son propios, en el verde de la app, y se generan con `python scripts/make-icons.py` (requiere Pillow): los del instalador en `installer/icons` y los de la app (móvil y web) en `apps/client/assets`.

Al desinstalar se conservan los datos, salvo que se pida borrarlos.

Para comprobar el servicio sin instalarlo (arranque, parada ordenada por Ctrl+C y registros), en otros puertos y con datos temporales:

```bash
pnpm test:service
```

Sin permisos de administrador hace una prueba rápida con `test` de WinSW: arranca el servicio, lo detiene al segundo y comprueba la parada por Ctrl+C, los registros y que no quede nada en marcha. Desde una terminal abierta como administrador hace la prueba completa con `testwait`: además comprueba que el núcleo y el broker quedan enlazados, la carpeta de datos, el panel y el orden de parada. La prueba nunca abre ventanas de control de cuentas (UAC).

## Sitio de documentación

```bash
pnpm --filter @integralo/contract build   # la referencia MQTT se genera desde el contrato
pnpm --filter @integralo/docs dev         # http://localhost:4321
pnpm --filter @integralo/docs build:docs  # sitio estático en apps/docs/dist
```

Cada página es un archivo Markdown en `apps/docs/src/content/docs/`; la barra lateral se arma con las carpetas y el campo `sidebar.order`. La dirección del repositorio y de la web se configura en `apps/docs/site.config.mjs`. El flujo `.github/workflows/docs.yml` publica el sitio en GitHub Pages al cambiar la documentación en `main` y al publicar una versión.

## Publicar una versión

1. Los mensajes de commit siguen Conventional Commits (`feat:`, `fix:`…). El flujo `release-please` mantiene abierta una solicitud de cambio con el número de la próxima versión y su `CHANGELOG.md`.
2. Al aceptarla se crean la etiqueta `vX.Y.Z` y la versión en GitHub Releases, y `package.json` queda con el número nuevo.
3. Se genera el instalador con ese número (`pnpm installer`) y se adjunta junto con el APK y el firmware:

```bash
gh release upload vX.Y.Z release/IntegrAlo-Setup-X.Y.Z.exe release/IntegrAlo-X.Y.Z.apk
```

4. Se vuelve a publicar la web, que toma de la versión los enlaces, el tamaño y la suma SHA-256 de cada archivo. Hace falta lanzarlo a mano, porque ni la versión creada por release-please ni la subida de archivos disparan otros flujos:

```bash
gh workflow run docs.yml
```

La página «Cambios» de la web muestra el `CHANGELOG.md` en cada publicación.

## Licencia

MIT, ver `LICENSE`.

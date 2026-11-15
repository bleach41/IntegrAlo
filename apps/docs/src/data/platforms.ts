/**
 * What can be downloaded, per platform. The files themselves come from the release
 * (src/lib/release.ts); this only describes them. Requirements list only what is known
 * from the project: add to them when something new is confirmed.
 */
export type PlatformId = 'windows' | 'android' | 'esp32';

export interface Platform {
  id: PlatformId;
  title: string;
  icon: 'seti:windows' | 'mobile-android' | 'seti:c';
  kind: string;
  /** Matches the release asset file name. */
  assetPattern: RegExp;
  requirements: string[];
  guide: { label: string; link: string };
}

export const PLATFORMS: Platform[] = [
  {
    id: 'windows',
    title: 'Servidor para Windows',
    icon: 'seti:windows',
    kind: 'Instalador .exe',
    assetPattern: /\.exe$/i,
    requirements: [
      'Windows con permisos de administrador para instalar.',
      'Puertos 4100 (app) y 1883 (nodos) libres en el equipo.',
    ],
    guide: { label: 'Guía de instalación', link: '/empezar/instalacion/' },
  },
  {
    id: 'android',
    title: 'App para Android',
    icon: 'mobile-android',
    kind: 'Archivo APK',
    assetPattern: /\.apk$/i,
    requirements: [
      'El teléfono en la misma red local que el servidor.',
      'Permiso de cámara, solo para leer el código QR de vinculación.',
    ],
    guide: { label: 'Primera conexión', link: '/empezar/primera-conexion/' },
  },
  {
    id: 'esp32',
    title: 'Firmware para ESP32',
    icon: 'seti:c',
    kind: 'Archivo .bin',
    assetPattern: /\.bin$/i,
    requirements: ['Placa ESP32 con Wi-Fi en la misma red que el servidor.'],
    guide: { label: 'Cargar el firmware', link: '/firmware/esp32/' },
  },
];

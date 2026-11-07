import { setZXingModuleOverrides } from 'barcode-detector';

/**
 * Web only. When the browser has no BarcodeDetector of its own (Chrome on Windows, Firefox),
 * expo-camera reads QR codes with zxing-wasm, which by default downloads its WebAssembly
 * module from a CDN on the Internet. IntegrAlo works on a local network, possibly without
 * Internet: the module is served by the app itself (copied to public/ by
 * scripts/copy-zxing-wasm.mjs).
 */
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) =>
    path.endsWith('.wasm') ? new URL(`/${path}`, globalThis.location.origin).href : prefix + path,
});

/** The browser only gives the camera to pages opened from this computer or over HTTPS. */
export function cameraUnavailableReason(): 'insecure' | 'none' | null {
  if (!globalThis.isSecureContext) return 'insecure';
  if (!globalThis.navigator?.mediaDevices?.getUserMedia) return 'none';
  return null;
}

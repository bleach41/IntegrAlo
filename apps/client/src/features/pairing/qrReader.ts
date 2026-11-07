/** Phone: the camera reads QR codes natively (see qrReader.web.ts for the web version). */
export function cameraUnavailableReason(): 'insecure' | 'none' | null {
  return null;
}

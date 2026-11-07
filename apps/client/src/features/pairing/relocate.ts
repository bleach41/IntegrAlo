import { Platform } from 'react-native';
import { normalizeServerUrl } from '@/api/client';
import { useSession } from '@/features/auth/session.store';
import { scanLocalNetwork } from './discovery';
import { verifyServer } from './identity';

/** First wait after a search that did not find the server; doubled each time, up to the maximum. */
const FIRST_PAUSE_MS = 60_000;
const MAX_PAUSE_MS = 10 * 60_000;

let running: Promise<boolean> | null = null;
let failures = 0;
let nextAllowedAt = 0;

/**
 * Looks for the paired server at another address, for when it stops answering at the saved one
 * (the router gave the laptop a new IP). The local network is searched for a server with the
 * paired public key, and it must prove that key (signature) before the app moves to it and sends
 * the session there; the session itself stays valid, since it is the same server.
 *
 * Phone only: on the web the app is loaded from the server itself, so a moved server means
 * opening the page at its new address. Searches are spaced (1, 2, 4… up to 10 minutes) so a
 * phone away from home does not keep scanning. Resolves true when the server was found elsewhere.
 */
export function relocatePairedServer(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  if (running) return running;
  if (Date.now() < nextAllowedAt) return Promise.resolve(false);
  running = search().finally(() => {
    running = null;
  });
  return running;
}

/** The server answered again at its address: the next loss can search at once. */
export function serverReachable(): void {
  failures = 0;
  nextAllowedAt = 0;
}

async function search(): Promise<boolean> {
  const { paired, serverUrl } = useSession.getState();
  if (!paired || !serverUrl) return false;
  try {
    const candidates = (await scanLocalNetwork()).filter((s) => s.health.publicKey === paired.publicKey);
    for (const candidate of candidates) {
      const url = normalizeServerUrl(candidate.address);
      if (url === serverUrl) continue; // it answers at the saved address again: nothing to move
      try {
        await verifyServer(url, paired.publicKey);
      } catch {
        continue; // claims the key but cannot sign with it: not our server
      }
      // The session may have changed while searching (signed out, another server chosen).
      if (useSession.getState().serverUrl !== serverUrl) return false;
      await useSession.getState().moveServer(url);
      serverReachable();
      return true;
    }
  } catch {
    // No local network (mobile data, Wi-Fi off): try again later.
  }
  failures += 1;
  nextAllowedAt = Date.now() + Math.min(MAX_PAUSE_MS, FIRST_PAUSE_MS * 2 ** (failures - 1));
  return false;
}

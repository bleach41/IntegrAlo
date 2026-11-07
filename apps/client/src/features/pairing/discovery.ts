import type { ServerHealth } from '@integralo/contract';
import { getIpAddressAsync } from 'expo-network';
import { Platform } from 'react-native';

export interface FoundServer {
  /** host:port, as typed in the connect screen. */
  address: string;
  health: ServerHealth;
}

const PORT = 4100;
const TIMEOUT_MS = 1500;
const PARALLEL = 32;

/**
 * Looks for IntegrAlo cores on the phone's local network: asks the 254 addresses of its
 * /24 network (for example 192.168.1.1–254) for /api/health, a few dozen at a time, and
 * keeps those that answer as IntegrAlo. Takes a few seconds. A found server is only a
 * candidate: connecting to it still verifies its identity (signature).
 */
export async function scanLocalNetwork(onFound?: (server: FoundServer) => void): Promise<FoundServer[]> {
  const hosts = Platform.OS === 'web' ? webHosts() : await phoneHosts();
  const found: FoundServer[] = [];

  let next = 0;
  async function worker() {
    while (next < hosts.length) {
      const host = hosts[next++];
      const health = await probe(host);
      if (health) {
        const server = { address: `${host}:${PORT}`, health };
        found.push(server);
        onFound?.(server);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return found.sort((a, b) => a.address.localeCompare(b.address, undefined, { numeric: true }));
}

/** The 254 addresses of the phone's /24 network. */
async function phoneHosts(): Promise<string[]> {
  const ip = await getIpAddressAsync();
  const match = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip ?? '');
  if (!match || ip === '0.0.0.0') throw new Error('no local network');
  return subnet(match[1]);
}

/**
 * A browser does not tell a page its own address (on the web expo-network would ask a public
 * Internet service for the public IP, which is useless here and leaves the local network):
 * the network searched is the one of the address the page was opened from. Opened from this
 * computer (localhost), only this computer is asked.
 */
function webHosts(): string[] {
  const host = globalThis.location?.hostname ?? '';
  const match = /^(\d+\.\d+\.\d+)\.\d+$/.exec(host);
  if (match && host !== '127.0.0.1') return subnet(match[1]);
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return ['localhost'];
  throw new Error('no local network');
}

function subnet(prefix: string): string[] {
  return Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
}

async function probe(host: string): Promise<ServerHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`http://${host}:${PORT}/api/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<ServerHealth>;
    return data?.status === 'ok' && typeof data.publicKey === 'string' ? (data as ServerHealth) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

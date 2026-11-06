import { createConnection, createServer } from 'node:net';
import { networkInterfaces } from 'node:os';

/** True if nothing is listening on the port yet. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

/** Waits until a TCP port accepts connections; false on timeout. */
export async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (open) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** IPv4 addresses of this computer on the local network (what nodes and phones use). */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    // 169.254.x.x is link-local (adapter without an address): no node can use it.
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a!.address);
}

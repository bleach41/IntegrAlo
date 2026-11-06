import { buildPairingPayload, type ServerHealth } from '@integralo/contract';
import qrcode from 'qrcode-generator';

/**
 * Pairing QR in the supervisor's console: the server is where the code belongs (the phone
 * scans what the computer shows). Waits for the core to answer, takes its public identity
 * from /api/health (nothing secret) and prints the code with its addresses.
 */
export async function printPairingWhenReady(httpPort: number, hosts: string[], log: (line: string) => void): Promise<void> {
  const health = await waitForHealth(httpPort, 60_000);
  if (!health) {
    log('[supervisor] the pairing code could not be shown: the core did not answer');
    return;
  }
  const payload = buildPairingPayload({ name: health.name, publicKey: health.publicKey, addresses: hosts.map((h) => `${h}:${httpPort}`) });
  log('[supervisor] Pair a phone: in the IntegrAlo app, "Scan QR code"');
  for (const line of renderQr(payload)) log(`  ${line}`);
  log(`[supervisor]   Server ${health.name} · id ${health.serverId}`);
}

async function waitForHealth(port: number, timeoutMs: number): Promise<ServerHealth | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      const data = (await response.json()) as Partial<ServerHealth>;
      if (data?.status === 'ok' && typeof data.publicKey === 'string') return data as ServerHealth;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/**
 * QR as text, two modules per character with half blocks. As Expo does, the blocks are
 * the LIGHT modules: on the usual dark console they show as the white paper of the code.
 */
export function renderQr(text: string): string[] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const margin = 2;
  const light = (r: number, c: number) => r < 0 || c < 0 || r >= size || c >= size || !qr.isDark(r, c);
  const lines: string[] = [];
  for (let r = -margin; r < size + margin; r += 2) {
    let line = '';
    for (let c = -margin; c < size + margin; c++) {
      const top = light(r, c);
      const bottom = light(r + 1, c);
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines;
}

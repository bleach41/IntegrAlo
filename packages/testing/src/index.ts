import { ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestBroker {
  url: string;
  stop(): Promise<void>;
}

/**
 * Temporary anonymous Mosquitto on its own port, so end-to-end checks never depend on (or
 * disturb) a broker already running on the computer, such as the supervisor's
 * authenticated one on 1883. INTEGRALO_E2E_MQTT_URL uses an existing broker instead.
 */
export async function startTestBroker(port: number): Promise<TestBroker> {
  const external = process.env.INTEGRALO_E2E_MQTT_URL;
  if (external) return { url: external, stop: async () => undefined };

  const dir = mkdtempSync(join(tmpdir(), 'integralo-e2e-broker-'));
  const config = join(dir, 'mosquitto.conf');
  writeFileSync(config, `listener ${port} 127.0.0.1\nallow_anonymous true\npersistence false\n`);
  const executable = join(process.env.INTEGRALO_MOSQUITTO_DIR ?? 'C:/Program Files/mosquitto', 'mosquitto.exe');
  const child: ChildProcess = spawn(executable, ['-c', config], { stdio: 'ignore', windowsHide: true });

  if (!(await waitForPort(port, 10_000))) {
    child.kill();
    throw new Error(`test broker did not start on port ${port}`);
  }
  return {
    url: `mqtt://127.0.0.1:${port}`,
    stop: async () => {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
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
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

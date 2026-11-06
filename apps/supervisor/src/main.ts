import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findMosquittoDir, prepareBroker } from './broker';
import { isPortFree, lanAddresses, waitForPort } from './net';
import { printPairingWhenReady } from './pairing';
import { ManagedProcess } from './process';
import { loadOrCreateSettings } from './settings';

/**
 * IntegrAlo supervisor (RNF-06): the single program a user starts (later, the single
 * Windows service). It prepares the configuration on first run, starts the MQTT broker
 * and the core as separate processes, restarts whichever fails and stops both in order.
 *
 * Usage: pnpm start  [--data-dir D] [--http-port 4100] [--broker-port 1883] [--web-dir DIR]
 */
const ROOT = resolve(__dirname, '..', '..', '..');
const { values } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: process.env.INTEGRALO_DATA_DIR ?? join(ROOT, '.data') },
    'http-port': { type: 'string' },
    'broker-port': { type: 'string' },
    'web-dir': { type: 'string', default: join(ROOT, 'apps', 'client', 'dist') },
  },
});

/** Local time (HH:MM:SS), as in the core's own log lines. */
const log = (line: string) => {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  console.log(`${time} ${line}`);
};

async function main(): Promise<void> {
  const dataDir = resolve(values['data-dir']);
  const { settings, created } = loadOrCreateSettings(dataDir, {
    httpPort: values['http-port'] ? Number(values['http-port']) : undefined,
    brokerPort: values['broker-port'] ? Number(values['broker-port']) : undefined,
  });
  log(`[supervisor] data directory ${dataDir}${created ? ' (first run: settings created)' : ''}`);

  for (const [what, port] of [['broker', settings.brokerPort], ['core', settings.httpPort]] as const) {
    if (!(await isPortFree(port))) {
      log(`[supervisor] port ${port} for the ${what} is already in use.`);
      if (what === 'broker') log('[supervisor] Is the Mosquitto Windows service running? Stop it, or use --broker-port.');
      process.exit(1);
    }
  }

  const mosquittoDir = findMosquittoDir();
  const configFile = prepareBroker(settings, join(dataDir, 'broker'), mosquittoDir);

  const broker = new ManagedProcess({
    name: 'broker',
    command: join(mosquittoDir, 'mosquitto.exe'),
    args: ['-c', configFile],
    log,
  });
  const webDir = values['web-dir'];
  const core = new ManagedProcess({
    name: 'core',
    command: process.execPath,
    args: ['--disable-warning=ExperimentalWarning', join(ROOT, 'apps', 'server', 'dist', 'main.js')],
    ipcShutdown: true,
    env: {
      INTEGRALO_PORT: String(settings.httpPort),
      INTEGRALO_MQTT_URL: `mqtt://127.0.0.1:${settings.brokerPort}`,
      INTEGRALO_MQTT_USERNAME: settings.core.username,
      INTEGRALO_MQTT_PASSWORD: settings.core.password,
      INTEGRALO_TOPIC_PREFIX: settings.topicPrefix,
      INTEGRALO_DB_PATH: join(dataDir, 'integralo.sqlite'),
      INTEGRALO_WEB_DIR: existsSync(join(webDir, 'index.html')) ? webDir : undefined,
      // Shown to engineers in the app, to program new nodes.
      INTEGRALO_NODE_MQTT_PORT: String(settings.brokerPort),
      INTEGRALO_NODE_MQTT_USERNAME: settings.nodes.username,
      INTEGRALO_NODE_MQTT_PASSWORD: settings.nodes.password,
    },
    log,
  });

  broker.start();
  if (!(await waitForPort(settings.brokerPort, 10_000))) {
    log('[supervisor] the broker did not start; see the messages above.');
    await broker.stop();
    process.exit(1);
  }
  core.start();
  printWelcome(settings.httpPort, settings.brokerPort, settings.nodes);
  void printPairingWhenReady(settings.httpPort, lanAddresses(), log);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log('[supervisor] stopping…');
    await core.stop(); // the core first: it still needs the broker to say goodbye
    await broker.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  // When started by another program (a Windows service wrapper, the e2e test): on Windows
  // killing the supervisor would leave its children running, so it is asked to stop instead.
  process.on('message', (message: unknown) => {
    if ((message as { type?: string } | null)?.type === 'shutdown') void shutdown();
  });
}

function printWelcome(httpPort: number, brokerPort: number, nodes: { username: string; password: string }): void {
  const hosts = lanAddresses();
  log('[supervisor] IntegrAlo is starting.');
  log(`[supervisor]   Open the app:  http://localhost:${httpPort}${hosts.map((h) => `  or  http://${h}:${httpPort}`).join('')}`);
  log(`[supervisor]   Nodes connect to MQTT port ${brokerPort} on ${hosts.join(', ') || 'this computer'}`);
  log(`[supervisor]   Node account:  ${nodes.username} (password in settings.json)`);
}

void main();

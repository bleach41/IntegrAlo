import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findMosquittoDir, prepareBroker } from './broker';
import { ChildrenRecord, stopLeftovers } from './leftovers';
import { isPortFree, lanAddresses, waitForPort } from './net';
import { printPairingWhenReady } from './pairing';
import { startPanel } from './panel';
import { ManagedProcess } from './process';
import { loadOrCreateSettings } from './settings';

/**
 * IntegrAlo supervisor (RNF-06): the single program a user starts (later, the single
 * Windows service). It prepares the configuration on first run, starts the MQTT broker
 * and the core as separate processes, restarts whichever fails and stops both in order.
 *
 * Usage: pnpm start  [--data-dir D] [--http-port 4100] [--broker-port 1883] [--web-dir DIR]
 *                    [--panel-port 4101] [--open-panel]
 */
const ROOT = resolve(__dirname, '..', '..', '..');
const { values } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: process.env.INTEGRALO_DATA_DIR ?? join(ROOT, '.data') },
    'http-port': { type: 'string' },
    'broker-port': { type: 'string' },
    'web-dir': { type: 'string', default: join(ROOT, 'apps', 'client', 'dist') },
    /** Server panel, on 127.0.0.1 only; by default the app's port + 1. */
    'panel-port': { type: 'string' },
    /** Open the panel in the browser once started (for the installed service). */
    'open-panel': { type: 'boolean', default: false },
  },
});

/** Last lines of the log, for the server panel. */
const LOG_LINES = 300;
/** Console color codes (ESC [ … m), removed from what the panel shows. */
const ANSI_COLORS = /\u001b\[[0-9;]*m/g;
const recentLog: string[] = [];

/** Local time (HH:MM:SS), as in the core's own log lines. */
const log = (line: string) => {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  console.log(`${time} ${line}`);
  // Without the console color codes (the core's Nest logger uses them): the panel shows plain text.
  recentLog.push(`${time} ${line}`.replace(ANSI_COLORS, ''));
  if (recentLog.length > LOG_LINES) recentLog.shift();
};

async function main(): Promise<void> {
  // Registered first: a stop request (Ctrl+C from the Windows service, closing the console)
  // can arrive while the platform is still starting. Whatever already started is then stopped
  // in order, and the start does not go on.
  let broker: ManagedProcess | undefined;
  let core: ManagedProcess | undefined;
  let panel: { close(): void } | null = null;
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log('[supervisor] stopping…');
    panel?.close();
    await core?.stop(); // the core first: it still needs the broker to say goodbye
    await broker?.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  // Closing the console window: Windows leaves a few seconds, enough for the orderly stop.
  process.on('SIGHUP', () => void shutdown());
  // Any other way out (an unexpected error): the core and the broker do not outlive it.
  process.on('exit', () => {
    core?.killNow();
    broker?.killNow();
  });
  // When started by another program (a Windows service wrapper, the e2e test): on Windows
  // killing the supervisor would leave its children running, so it is asked to stop instead.
  process.on('message', (message: unknown) => {
    if ((message as { type?: string } | null)?.type === 'shutdown') void shutdown();
  });

  const dataDir = resolve(values['data-dir']);
  const { settings, created } = loadOrCreateSettings(dataDir, {
    httpPort: values['http-port'] ? Number(values['http-port']) : undefined,
    brokerPort: values['broker-port'] ? Number(values['broker-port']) : undefined,
  });
  log(`[supervisor] data directory ${dataDir}${created ? ' (first run: settings created)' : ''}`);

  await stopLeftovers(dataDir, log);
  if (stopping) return;
  const children = new ChildrenRecord(dataDir);
  for (const [what, port] of [['broker', settings.brokerPort], ['core', settings.httpPort]] as const) {
    if (!(await isPortFree(port))) {
      log(`[supervisor] port ${port} for the ${what} is already in use.`);
      if (what === 'broker') log('[supervisor] Is the Mosquitto Windows service running? Stop it, or use --broker-port.');
      process.exit(1);
    }
  }
  if (stopping) return;

  const mosquittoDir = findMosquittoDir(ROOT);
  log(`[supervisor] MQTT broker from ${mosquittoDir}`);
  const configFile = prepareBroker(settings, join(dataDir, 'broker'), mosquittoDir);

  const brokerCommand = join(mosquittoDir, 'mosquitto.exe');
  broker = new ManagedProcess({
    name: 'broker',
    command: brokerCommand,
    args: ['-c', configFile],
    log,
    onStarted: (pid) => children.started('broker', pid, brokerCommand),
  });
  const webDir = values['web-dir'];
  core = new ManagedProcess({
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
    onStarted: (pid) => children.started('core', pid, process.execPath),
  });

  broker.start();
  if (!(await waitForPort(settings.brokerPort, 10_000))) {
    log('[supervisor] the broker did not start; see the messages above.');
    await broker.stop();
    process.exit(1);
  }
  if (stopping) return;
  core.start();
  printWelcome(settings.httpPort, settings.brokerPort, settings.nodes);
  void printPairingWhenReady(settings.httpPort, lanAddresses(), log, (line) => console.log(line));

  // The panel is a convenience: if its port is taken, the platform still runs without it.
  const panelPort = values['panel-port'] ? Number(values['panel-port']) : settings.httpPort + 1;
  const started = await startPanel({
    port: panelPort,
    httpPort: settings.httpPort,
    brokerPort: settings.brokerPort,
    broker,
    core,
    hosts: lanAddresses,
    nodeAccount: settings.nodes,
    logs: () => recentLog,
    startedAt: Date.now(),
    log,
  }).catch((err: Error) => {
    log(`[supervisor] the server panel could not start on port ${panelPort}: ${err.message}`);
    return null;
  });
  if (stopping) {
    started?.close();
    return;
  }
  panel = started;
  if (panel) {
    const url = `http://127.0.0.1:${panelPort}`;
    log(`[supervisor]   Server panel:  ${url}  (only from this computer)`);
    if (values['open-panel']) openInBrowser(url);
  }

}

function printWelcome(httpPort: number, brokerPort: number, nodes: { username: string; password: string }): void {
  const hosts = lanAddresses();
  log('[supervisor] IntegrAlo is starting.');
  log(`[supervisor]   Open the app:  http://localhost:${httpPort}${hosts.map((h) => `  or  http://${h}:${httpPort}`).join('')}`);
  log(`[supervisor]   Nodes connect to MQTT port ${brokerPort} on ${hosts.join(', ') || 'this computer'}`);
  log(`[supervisor]   Node account:  ${nodes.username} (password in settings.json)`);
}

/** Opens a page in the default browser (Windows; elsewhere, xdg-open / open). */
function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

void main();

import { ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeTopic } from '@integralo/contract';
import mqtt from 'mqtt';
import type { Settings } from '../settings';

/**
 * End-to-end check of the all-in-one supervisor (RNF-06) on its own ports, so it does
 * not touch a broker or core already running: first-run settings, authenticated broker
 * reachable on the network, core supervised and restarted after a crash, web client
 * served by the core, and an orderly stop of everything.
 */
const BROKER_PORT = 1884;
const HTTP_PORT = 4102;
const API = `http://127.0.0.1:${HTTP_PORT}/api`;

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(probe: () => Promise<T | null | undefined | false>, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch {
      // not ready yet
    }
    await sleep(250);
  }
  return null;
}

const health = () => fetch(`${API}/health`).then((r) => r.json() as Promise<{ broker: string }>);

/** PID listening on a TCP port (Windows netstat). */
function listeningPid(port: number): number | null {
  const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
  const line = out.split(/\r?\n/).find((l) => new RegExp(`:${port}\\s.*LISTENING`).test(l));
  return line ? Number(line.trim().split(/\s+/).pop()) : null;
}

async function connects(options: mqtt.IClientOptions): Promise<boolean> {
  try {
    const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${BROKER_PORT}`, { ...options, reconnectPeriod: 0, connectTimeout: 4000 });
    await client.endAsync();
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'integralo-supervisor-e2e-'));
  const supervisor: ChildProcess = spawn(
    process.execPath,
    [join(__dirname, '..', 'main.js'), '--data-dir', dataDir, '--broker-port', String(BROKER_PORT), '--http-port', String(HTTP_PORT)],
    { stdio: process.env.E2E_VERBOSE ? ['ignore', 'inherit', 'inherit', 'ipc'] : ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  const exited = new Promise<number | null>((resolve) => supervisor.once('exit', (code) => resolve(code)));

  try {
    const up = await until(async () => (await health()).broker === 'connected', 40_000);
    check('supervisor starts broker and core; core connected to the broker', !!up);

    const settings = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) as Settings;
    check('first run creates settings with random passwords', settings.core.password.length === 24 && settings.core.password !== settings.nodes.password);
    const passwordFile = readFileSync(join(dataDir, 'broker', 'passwords'), 'utf8');
    check('broker password file stores hashes, not passwords',
      !passwordFile.includes(settings.core.password) && !passwordFile.includes(settings.nodes.password));

    check('anonymous MQTT connection refused', !(await connects({})));
    check('wrong password refused', !(await connects({ username: settings.nodes.username, password: 'wrong' })));
    check('node account accepted', await connects({ username: settings.nodes.username, password: settings.nodes.password }));

    // A node with the node account announces itself and the supervised core registers it.
    const node = await mqtt.connectAsync(`mqtt://127.0.0.1:${BROKER_PORT}`, {
      username: settings.nodes.username,
      password: settings.nodes.password,
    });
    await node.publishAsync(nodeTopic('sim-supv01', 'announce', settings.topicPrefix),
      JSON.stringify({ nodeId: 'sim-supv01', module: 'temperature', fw: 'test', uptimeMs: 0 }), { qos: 1, retain: true });
    const setup = await fetch(`${API}/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'supervisor-e2e' }),
    });
    const { token } = (await (await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'supervisor-e2e' }),
    })).json()) as { token: string };
    const registered = await until(async () => {
      const r = await fetch(`${API}/nodes/sim-supv01`, { headers: { authorization: `Bearer ${token}` } });
      return r.ok;
    }, 5000);
    check('node with the node account registered through the authenticated broker', setup.ok && !!registered);
    await node.endAsync();

    const page = await fetch(`http://127.0.0.1:${HTTP_PORT}/nodes/abc`).then((r) => r.text()).catch(() => '');
    check('core serves the web client (SPA fallback)', page.includes('<div id="root"'));

    // Crash the core: the supervisor restarts it.
    const pid = listeningPid(HTTP_PORT);
    if (pid) process.kill(pid);
    const down = await until(async () => {
      try {
        await health();
        return false;
      } catch {
        return true;
      }
    }, 5000);
    const back = await until(async () => (await health()).broker === 'connected', 20_000);
    check('core restarted by the supervisor after a crash', !!pid && !!down && !!back);

    supervisor.send({ type: 'shutdown' });
    const code = await Promise.race([exited, sleep(15_000).then(() => 'timeout' as const)]);
    await sleep(500);
    check('orderly stop ends the supervisor and frees both ports',
      code === 0 && listeningPid(HTTP_PORT) === null && listeningPid(BROKER_PORT) === null, `exit ${code}`);
  } finally {
    if (supervisor.exitCode === null) supervisor.kill();
    for (const port of [HTTP_PORT, BROKER_PORT]) {
      const pid = listeningPid(port);
      if (pid) process.kill(pid);
    }
    await sleep(300);
    rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`e2e aborted: ${(err as Error).message}`);
  process.exitCode = 1;
});

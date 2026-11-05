import { ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeTopic } from '@integralo/contract';
import mqtt from 'mqtt';

/**
 * End-to-end check of the core with a simulated node and a running broker.
 * Starts the core (temporary database) and the simulated node as separate processes and
 * drives the REST API as a client would: registration and approval, telemetry storage,
 * confirmed / rejected / unconfirmed commands, connection status and audit events.
 * Usage: pnpm --filter @integralo/server e2e  (needs Mosquitto on INTEGRALO_MQTT_URL)
 */
const BROKER = process.env.INTEGRALO_MQTT_URL ?? 'mqtt://localhost:1883';
const PORT = 4199;
const API = `http://localhost:${PORT}/api`;
const SIM_ID = 'sim-e2e002';
const MUTE_ID = 'sim-mute01';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** Polls until the predicate returns a value, or null after the timeout. */
async function until<T>(probe: () => Promise<T | null | undefined | false>, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch {
      // server not ready yet
    }
    await sleep(100);
  }
  return null;
}

async function commandOutcome(cmdId: string, timeoutMs: number) {
  return until(async () => {
    const { data } = await http('GET', `/commands/${cmdId}`);
    return data.status !== 'sent' ? data : null;
  }, timeoutMs);
}

function spawnNode(script: string, args: string[], env: NodeJS.ProcessEnv = {}): ChildProcess {
  return spawn(process.execPath, ['--disable-warning=ExperimentalWarning', script, ...args], {
    stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore',
    env: { ...process.env, ...env },
  });
}

async function main(): Promise<void> {
  const workDir = mkdtempSync(join(tmpdir(), 'integralo-core-e2e-'));
  const serverScript = join(__dirname, '..', 'main.js');
  const simScript = join(__dirname, '..', '..', '..', 'sim-node', 'dist', 'index.js');
  const startSim = () => spawnNode(simScript, ['--node-id', SIM_ID, '--state-dir', workDir, '--broker', BROKER]);

  const probe = await mqtt.connectAsync(BROKER, { clientId: `integralo-core-e2e-${process.pid}` });
  const clearRetained = async () => {
    for (const id of [SIM_ID, MUTE_ID]) {
      for (const kind of ['announce', 'status'] as const) {
        await probe.publishAsync(nodeTopic(id, kind), '', { qos: 1, retain: true });
      }
    }
  };
  await clearRetained();

  const server = spawnNode(serverScript, [], {
    INTEGRALO_PORT: String(PORT),
    INTEGRALO_DB_PATH: join(workDir, 'e2e.sqlite'),
    INTEGRALO_MQTT_URL: BROKER,
  });
  let sim: ChildProcess | undefined;

  try {
    const health = await until(async () => {
      const { data } = await http('GET', '/health');
      return data.broker === 'connected' ? data : null;
    }, 30000);
    check('core started and connected to the broker', !!health);
    const modules = await http('GET', '/modules');
    check('temperature module loaded from its manifest', modules.data.some((m: any) => m.id === 'temperature'));

    // P1: registration with manual approval
    const simStarted = Date.now();
    sim = startSim();
    const pending = await until(async () => {
      const { data } = await http('GET', `/nodes/${SIM_ID}`);
      return data.approval === 'pending' ? data : null;
    }, 5000);
    check('new node appears as pending', !!pending, pending ? `${Date.now() - simStarted} ms` : 'timeout');

    await sleep(2500);
    const before = await http('GET', `/nodes/${SIM_ID}/telemetry`);
    check('telemetry of a pending node is not stored', before.status === 200 && before.data.length === 0);
    const blocked = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } });
    check('commands to a pending node are refused', blocked.status === 409);

    const approved = await http('POST', `/nodes/${SIM_ID}/approve`, { name: 'Habitación 1' });
    check('node approved with a name', approved.status === 201 && approved.data.approval === 'approved' && approved.data.name === 'Habitación 1');

    // P2: telemetry storage
    await sleep(5000);
    const samples = (await http('GET', `/nodes/${SIM_ID}/telemetry`)).data as Array<{ seq: number; values: any }>;
    const consecutive = samples.every((s, i) => i === 0 || s.seq === samples[i - 1].seq + 1);
    check('telemetry stored after approval', samples.length >= 2 && consecutive, `${samples.length} samples`);
    check('stored telemetry has temperature', typeof samples[0]?.values.temperature === 'number');

    // P3: confirmed and rejected commands
    const sent = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } });
    check('command accepted by the API in state "sent"', sent.status === 201 && sent.data.status === 'sent');
    const confirmed = await commandOutcome(sent.data.id, 3000);
    check('command confirmed by the node', confirmed?.status === 'confirmed' && confirmed.state.mode === 'auto',
      confirmed ? `${confirmed.resolvedAt - confirmed.sentAt} ms` : 'timeout');
    const bad = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_setpoint', payload: { setpoint: 80 } });
    const rejected = await commandOutcome(bad.data.id, 3000);
    check('out-of-range command rejected with its reason', rejected?.status === 'rejected' && rejected.reason === 'out_of_range');
    const unknown = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'reboot', payload: {} });
    check('command not declared by the module refused (400)', unknown.status === 400);

    // P3: unconfirmed — a node that is online but never answers
    await probe.publishAsync(nodeTopic(MUTE_ID, 'announce'), JSON.stringify({ nodeId: MUTE_ID, module: 'temperature', fw: 'mute', uptimeMs: 0 }), { qos: 1, retain: true });
    await probe.publishAsync(nodeTopic(MUTE_ID, 'status'), 'online', { qos: 1, retain: true });
    await until(async () => (await http('GET', `/nodes/${MUTE_ID}`)).data.online === true, 5000);
    await http('POST', `/nodes/${MUTE_ID}/approve`, {});
    const muteCmd = await http('POST', `/nodes/${MUTE_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } });
    const unconfirmed = await commandOutcome(muteCmd.data.id, 8000);
    check('command without answer ends as unconfirmed', unconfirmed?.status === 'unconfirmed' && unconfirmed.reason === 'ack_timeout',
      unconfirmed ? `${unconfirmed.resolvedAt - unconfirmed.sentAt} ms` : 'timeout');

    // P4 (partial): connection status
    const killed = Date.now();
    sim.kill('SIGKILL');
    const offline = await until(async () => (await http('GET', `/nodes/${SIM_ID}`)).data.online === false, 20000);
    check('node marked offline after abrupt stop', !!offline, `${Date.now() - killed} ms`);
    const refused = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_mode', payload: { mode: 'off' } });
    check('commands to an offline node are refused', refused.status === 409);

    sim = startSim();
    const back = await until(async () => (await http('GET', `/nodes/${SIM_ID}`)).data.online === true, 5000);
    const node = (await http('GET', `/nodes/${SIM_ID}`)).data;
    check('approved node recognised on reconnection', !!back && node.approval === 'approved');

    // RF-06: audit trail
    const kinds = new Set(((await http('GET', `/events?nodeId=${SIM_ID}`)).data as any[]).map((e) => e.kind));
    const expected = ['node.discovered', 'node.approved', 'node.online', 'node.offline', 'command.sent', 'command.confirmed', 'command.rejected'];
    const missing = expected.filter((k) => !kinds.has(k));
    check('audit log records the whole sequence', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${kinds.size} kinds`);
    const discovered = ((await http('GET', `/events?nodeId=${SIM_ID}`)).data as any[]).filter((e) => e.kind === 'node.discovered');
    check('reconnection does not register the node again', discovered.length === 1);
  } finally {
    sim?.kill('SIGKILL');
    server.kill('SIGKILL');
    await sleep(500);
    await clearRetained();
    await probe.endAsync();
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`e2e aborted: ${(err as Error).message}`);
  process.exitCode = 1;
});

import { ChildProcess, spawn } from 'node:child_process';
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { identityMessage, nodeTopic, parsePairingPayload } from '@integralo/contract';
import { startTestBroker } from '@integralo/testing';
import mqtt from 'mqtt';

/**
 * End-to-end check of the core with a simulated node and a running broker.
 * Starts the core (temporary database) and the simulated node as separate processes and
 * drives the REST API as a client would: registration and approval, telemetry storage,
 * confirmed / rejected / unconfirmed commands, connection status and audit events.
 * Usage: pnpm --filter @integralo/server e2e  (needs Mosquitto on INTEGRALO_MQTT_URL)
 */
/** Own temporary broker (see @integralo/testing); set at the start of main(). */
let BROKER = '';
const BROKER_PORT = 1885;
/** Own topic prefix, so a platform running on the same broker does not register the test nodes. */
const PREFIX = 'integralo-e2e';
const PORT = 4199;
/** Telemetry timeout of the core under test: short, so a silent node is detected quickly. */
const SILENCE_MS = 8000;
const API = `http://localhost:${PORT}/api`;
const SIM_ID = 'sim-e2e002';
const MUTE_ID = 'sim-mute01';
const TANK_ID = 'tank-e2e01';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Session token used by http(); changed when the test signs in as another user. */
let token: string | undefined;

async function http(method: string, path: string, body?: unknown, as = token): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (as) headers.authorization = `Bearer ${as}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
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
  const broker = await startTestBroker(BROKER_PORT);
  BROKER = broker.url;
  const workDir = mkdtempSync(join(tmpdir(), 'integralo-core-e2e-'));
  const serverScript = join(__dirname, '..', 'main.js');
  const simScript = join(__dirname, '..', '..', '..', 'sim-node', 'dist', 'index.js');
  const startSim = () => spawnNode(simScript, ['--node-id', SIM_ID, '--state-dir', workDir, '--broker', BROKER, '--topic-prefix', PREFIX]);

  const probe = await mqtt.connectAsync(BROKER, { clientId: `integralo-core-e2e-${process.pid}` });
  const clearRetained = async () => {
    for (const id of [SIM_ID, MUTE_ID, TANK_ID]) {
      for (const kind of ['announce', 'status'] as const) {
        await probe.publishAsync(nodeTopic(id, kind, PREFIX), '', { qos: 1, retain: true });
      }
    }
  };
  await clearRetained();

  const server = spawnNode(serverScript, [], {
    INTEGRALO_PORT: String(PORT),
    INTEGRALO_DB_PATH: join(workDir, 'e2e.sqlite'),
    INTEGRALO_MQTT_URL: BROKER,
    INTEGRALO_TOPIC_PREFIX: PREFIX,
    INTEGRALO_TELEMETRY_TIMEOUT_MS: String(SILENCE_MS),
  });
  let sim: ChildProcess | undefined;
  let tank: ChildProcess | undefined;

  try {
    const health = await until(async () => {
      const { data } = await http('GET', '/health');
      return data.broker === 'connected' ? data : null;
    }, 30000);
    check('core started and connected to the broker', !!health);

    // Server identity (pairing): the core signs the app's challenge with its Ed25519 key
    check('health identifies the server', typeof health?.publicKey === 'string' && health.publicKey.length === 43 && /·/.test(health.serverId));
    const nonce = randomBytes(24).toString('base64url');
    const proof = await http('GET', `/identity?nonce=${nonce}`, undefined, '');
    const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: health?.publicKey ?? '' }, format: 'jwk' });
    const signed = (n: string) => verify(null, Buffer.from(identityMessage(n)), publicKey, Buffer.from(proof.data?.signature ?? '', 'base64url'));
    check('identity challenge signed with the server key', proof.status === 200 && signed(nonce));
    check('the signature is only valid for that challenge', !signed(`${nonce}x`));
    check('malformed challenges refused', (await http('GET', '/identity?nonce=short', undefined, '')).status === 400);
    check('pairing data needs a session', (await http('GET', '/system/pairing', undefined, '')).status === 401);

    // RF-08: first-run setup, sign-in and permissions
    check('API refuses requests without a session', (await http('GET', '/nodes')).status === 401);
    check('fresh installation needs setup', (await http('GET', '/setup')).data.needsSetup === true);
    const admin = await http('POST', '/setup', { username: 'admin', password: 'admin-e2e-pass' });
    check('setup creates the first engineering account', admin.status === 201 && admin.data.roleId === 'engineer');
    check('setup cannot run twice', (await http('POST', '/setup', { username: 'other', password: 'other-e2e-pass' })).status === 409);
    check('wrong password refused', (await http('POST', '/auth/login', { username: 'admin', password: 'wrong-password' })).status === 401);
    const login = await http('POST', '/auth/login', { username: 'admin', password: 'admin-e2e-pass' });
    check('engineer signs in', login.status === 200 && typeof login.data.token === 'string');
    token = login.data.token;
    const pairing = await http('GET', '/system/pairing');
    const parsed = parsePairingPayload(pairing.data?.payload ?? '');
    check('pairing QR carries the server key and its addresses', pairing.status === 200 && parsed?.publicKey === health?.publicKey && (parsed?.addresses.length ?? 0) > 0);
    const created = await http('POST', '/users', { username: 'tony', password: 'tony-e2e-pass', roleId: 'user' });
    check('engineer creates a user account', created.status === 201);
    check('passwords shorter than 8 characters refused',
      (await http('POST', '/users', { username: 'weak', password: 'short', roleId: 'user' })).status === 400);
    const userToken = (await http('POST', '/auth/login', { username: 'tony', password: 'tony-e2e-pass' })).data.token as string;

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

    check('user profile cannot approve nodes', (await http('POST', `/nodes/${SIM_ID}/approve`, {}, userToken)).status === 403);
    const approved = await http('POST', `/nodes/${SIM_ID}/approve`, { name: 'Habitación 1' });
    check('node approved with a name', approved.status === 201 && approved.data.approval === 'approved' && approved.data.name === 'Habitación 1');
    const initialConfigs = (await http('GET', `/nodes/${SIM_ID}/alarm-configs`)).data as any[];
    check('alarm on-delay taken from the manifest (60 s)', initialConfigs.some((c) => c.key === 'highTemp' && c.delayS === 60));
    // Without delay from here on, so the test does not wait a minute for each alarm.
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { delayS: 0 });

    // P2: telemetry storage
    await sleep(5000);
    const samples = (await http('GET', `/nodes/${SIM_ID}/telemetry`)).data as Array<{ seq: number; values: any }>;
    const consecutive = samples.every((s, i) => i === 0 || s.seq === samples[i - 1].seq + 1);
    check('telemetry stored after approval', samples.length >= 2 && consecutive, `${samples.length} samples`);
    check('stored telemetry has temperature', typeof samples[0]?.values.temperature === 'number');
    const csvRes = await fetch(`${API}/nodes/${SIM_ID}/telemetry/export.csv`, { headers: { authorization: `Bearer ${token}` } });
    const csvLines = (await csvRes.text()).trim().split('\r\n');
    check('telemetry exported as CSV with manifest columns',
      csvRes.headers.get('content-type')?.startsWith('text/csv') === true &&
        csvLines[0] === 'time_iso,time_ms,seq,temperature,setpoint,output,mode,outdoorTemperature' &&
        csvLines.length >= samples.length + 1,
      `${csvLines.length - 1} rows`);

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

    const userSetpoint = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_setpoint', payload: { setpoint: 25 } }, userToken);
    check('user profile can change the setpoint', userSetpoint.status === 201 && (await commandOutcome(userSetpoint.data.id, 3000))?.status === 'confirmed');
    check('user profile cannot change control parameters',
      (await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_params', payload: { hysteresis: 1 } }, userToken)).status === 403);
    check('user profile cannot read the audit log', (await http('GET', '/events', undefined, userToken)).status === 403);
    // Real time: authenticated WebSocket
    const WS = (globalThis as any).WebSocket;
    const ws = new WS(`ws://localhost:${PORT}/api/ws`);
    const wsEvents: Array<{ event: string; data: any }> = [];
    ws.onmessage = (e: { data: string }) => wsEvents.push(JSON.parse(e.data));
    await new Promise((resolve) => (ws.onopen = resolve));
    ws.send(JSON.stringify({ event: 'auth', data: { token: userToken } }));
    const wsAuth = await until(async () => wsEvents.find((e) => e.event === 'auth'), 3000);
    check('WebSocket accepts a valid session', wsAuth?.data.username === 'tony');
    const wsTelemetry = await until(async () => wsEvents.find((e) => e.event === 'telemetry' && e.data.nodeId === SIM_ID), 5000);
    check('telemetry pushed in real time', !!wsTelemetry);
    const anonymous = new WS(`ws://localhost:${PORT}/api/ws`);
    const closeCode = await new Promise<number>((resolve) => {
      anonymous.onclose = (e: { code: number }) => resolve(e.code);
      setTimeout(() => resolve(-1), 8000);
    });
    check('WebSocket without authentication is closed', closeCode === 4001, `code ${closeCode}`);

    // RF-05: threshold alarm with its three moments
    const configs = (await http('GET', `/nodes/${SIM_ID}/alarm-configs`)).data as any[];
    check('alarm thresholds created from the manifest defaults',
      configs.some((c) => c.key === 'highTemp' && c.threshold === 28 && c.enabled));
    const high = await until(async () => {
      const { data } = await http('GET', `/alarms?nodeId=${SIM_ID}`, undefined, userToken);
      return (data as any[]).find((a) => a.key === 'highTemp');
    }, 5000);
    check('high temperature alarm raised (room at ~30 °C > 28 °C)', high?.state === 'active', high ? `value ${high.raisedValue}` : 'none');
    const acked = await http('POST', `/alarms/${high?.id}/ack`, undefined, userToken);
    check('user acknowledges the alarm', acked.data.state === 'acknowledged' && acked.data.ackedBy === 'tony');
    check('user profile cannot change alarm thresholds',
      (await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 40 }, userToken)).status === 403);
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 40 });
    const closed = await until(async () => {
      const { data } = await http('GET', `/alarms?nodeId=${SIM_ID}&open=false`);
      const a = (data as any[]).find((x) => x.id === high?.id);
      return a?.state === 'closed' ? a : null;
    }, 5000);
    check('alarm cleared below the new threshold and closed', !!closed);
    // The alarm was raised right after approval, before this socket connected: only later changes are expected.
    check('alarm changes pushed in real time',
      ['acknowledged', 'closed'].every((s) => wsEvents.some((e) => e.event === 'alarm' && e.data.id === high?.id && e.data.state === s)));
    ws.close();

    // ISA-18.2: a repeated activation before acknowledgement reuses the same occurrence
    const highAlarms = async () =>
      ((await http('GET', `/alarms?nodeId=${SIM_ID}`)).data as any[]).filter((a) => a.key === 'highTemp');
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 20 });
    const second = await until(async () => (await highAlarms()).find((a) => a.state === 'active'), 5000);
    check('alarm raised again after it was closed (new occurrence)', !!second && second.id !== high?.id && second.count === 1);
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 40 });
    await until(async () => (await highAlarms()).find((a) => a.state === 'cleared'), 5000);
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 20 });
    const again = await until(async () => (await highAlarms()).find((a) => a.state === 'active' && a.count === 2), 5000);
    const openHigh = await highAlarms();
    check('unacknowledged alarm reactivated instead of duplicated', again?.id === second?.id && openHigh.length === 1, again ? `count ${again.count}` : 'none');

    // On-delay: a condition shorter than delayS raises nothing
    await http('POST', `/alarms/${second?.id}/ack`);
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 40 });
    await until(async () => (await highAlarms()).length === 0, 5000);
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 20, delayS: 30 });
    await sleep(5000);
    check('on-delay holds back a condition shorter than the delay', (await highAlarms()).length === 0);
    await http('PUT', `/nodes/${SIM_ID}/alarm-configs/highTemp`, { threshold: 40, delayS: 0 });

    await http('POST', '/auth/logout', undefined, userToken);
    check('session invalid after logout', (await http('GET', '/nodes', undefined, userToken)).status === 401);

    // P3: unconfirmed — a node that is online but never answers
    await probe.publishAsync(nodeTopic(MUTE_ID, 'announce', PREFIX), JSON.stringify({ nodeId: MUTE_ID, module: 'temperature', fw: 'mute', uptimeMs: 0 }), { qos: 1, retain: true });
    await probe.publishAsync(nodeTopic(MUTE_ID, 'status', PREFIX), 'online', { qos: 1, retain: true });
    await until(async () => (await http('GET', `/nodes/${MUTE_ID}`)).data.online === true, 5000);
    await http('POST', `/nodes/${MUTE_ID}/approve`, {});
    const muteCmd = await http('POST', `/nodes/${MUTE_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } });
    const unconfirmed = await commandOutcome(muteCmd.data.id, 8000);
    check('command without answer ends as unconfirmed', unconfirmed?.status === 'unconfirmed' && unconfirmed.reason === 'ack_timeout',
      unconfirmed ? `${unconfirmed.resolvedAt - unconfirmed.sentAt} ms` : 'timeout');
    // Its retained "online" must not keep it online for ever: silence means offline.
    const silentOffline = await until(async () => (await http('GET', `/nodes/${MUTE_ID}`)).data.online === false, SILENCE_MS + 10000);
    check('silent node marked offline despite a retained "online"', !!silentOffline);
    const muteRefused = await http('POST', `/nodes/${MUTE_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } });
    check('commands to an offline node are refused at once', muteRefused.status >= 400 && muteRefused.status < 500, `HTTP ${muteRefused.status}`);

    // Node management: rename, then retire the dead node; it comes back pending if it reconnects
    const renamed = await http('PATCH', `/nodes/${MUTE_ID}`, { name: 'Placa vieja' });
    check('node renamed', renamed.status === 200 && renamed.data.name === 'Placa vieja');
    const retired = await http('POST', `/nodes/${MUTE_ID}/retire`, {});
    const listed = (await http('GET', '/nodes')).data as Array<{ id: string }>;
    check('retired node leaves the list', retired.status === 204 && !listed.some((n) => n.id === MUTE_ID));
    const muteAlarms = ((await http('GET', '/alarms')).data as Array<{ nodeId: string; state: string }>).filter((a) => a.nodeId === MUTE_ID && a.state !== 'closed');
    check('alarms of a retired node are closed', muteAlarms.length === 0, `${muteAlarms.length} open`);
    // Its retained announce is gone: a fresh subscriber (a restarted core) receives nothing.
    const retainedLeft = await new Promise<boolean>((resolve) => {
      const viewer = mqtt.connect(BROKER, { clientId: `integralo-e2e-viewer-${process.pid}` });
      const timer = setTimeout(() => { viewer.end(true); resolve(false); }, 1500);
      viewer.on('message', (_topic, payload) => {
        if (payload.length > 0) { clearTimeout(timer); viewer.end(true); resolve(true); }
      });
      viewer.subscribe(nodeTopic(MUTE_ID, 'announce', PREFIX));
    });
    check('retired node leaves no retained announce behind', !retainedLeft);
    await probe.publishAsync(nodeTopic(MUTE_ID, 'announce', PREFIX), JSON.stringify({ nodeId: MUTE_ID, module: 'temperature', fw: 'mute', uptimeMs: 0 }), { qos: 1, retain: true });
    const returned = await until(async () => {
      const { data } = await http('GET', '/nodes');
      return (data as Array<{ id: string; approval: string }>).find((n) => n.id === MUTE_ID && n.approval === 'pending');
    }, 5000);
    check('retired node reappears as pending when it reconnects', !!returned);

    // Disconnecting an online node: it loses its approval at once but stays listed as pending
    const revoked = await http('POST', `/nodes/${SIM_ID}/retire`, {});
    const simAfter = (await http('GET', `/nodes/${SIM_ID}`)).data;
    check('online node disconnected: back to pending, still listed', revoked.status === 204 && simAfter.approval === 'pending' && simAfter.retiredAt === null);
    const toRevoked = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } });
    check('commands to a disconnected node are refused', toRevoked.status >= 400 && toRevoked.status < 500, `HTTP ${toRevoked.status}`);
    await http('POST', `/nodes/${SIM_ID}/approve`, { name: 'Habitación 1' });

    // P4 (partial): connection status
    const killed = Date.now();
    sim.kill('SIGKILL');
    const offline = await until(async () => (await http('GET', `/nodes/${SIM_ID}`)).data.online === false, 20000);
    check('node marked offline after abrupt stop', !!offline, `${Date.now() - killed} ms`);
    const refused = await http('POST', `/nodes/${SIM_ID}/commands`, { type: 'set_mode', payload: { mode: 'off' } });
    check('commands to an offline node are refused', refused.status === 409);
    const commLoss = await until(async () => {
      const { data } = await http('GET', `/alarms?nodeId=${SIM_ID}`);
      return (data as any[]).find((a) => a.key === 'commLoss' && a.state === 'active');
    }, 3000);
    check('communication loss alarm raised', !!commLoss, commLoss ? `${commLoss.raisedAt - killed} ms after the stop` : 'none');

    sim = startSim();
    const back = await until(async () => (await http('GET', `/nodes/${SIM_ID}`)).data.online === true, 5000);
    const node = (await http('GET', `/nodes/${SIM_ID}`)).data;
    check('approved node recognised on reconnection', !!back && node.approval === 'approved');
    const restored = await until(async () => {
      const { data } = await http('GET', `/alarms?nodeId=${SIM_ID}`);
      return (data as any[]).find((a) => a.id === commLoss?.id && a.state === 'cleared');
    }, 5000);
    check('communication alarm cleared when telemetry returns (still unacknowledged)', !!restored);

    // P6: a second module (tank level) works with no module-specific code in the core
    tank = spawnNode(simScript, ['--module', 'tank-level', '--node-id', TANK_ID, '--state-dir', workDir, '--broker', BROKER, '--topic-prefix', PREFIX]);
    const modulesNow = (await http('GET', '/modules')).data as any[];
    check('P6: tank-level module loaded from its manifest', modulesNow.some((m) => m.id === 'tank-level'));
    const tankPending = await until(async () => (await http('GET', `/nodes/${TANK_ID}`)).data.approval === 'pending', 5000);
    check('P6: tank node registered as pending', !!tankPending);
    await http('POST', `/nodes/${TANK_ID}/approve`, { name: 'Cisterna' });
    const tankSample = await until(async () => {
      const { data } = await http('GET', `/nodes/${TANK_ID}/telemetry`);
      return (data as any[]).find((s) => typeof s.values.level === 'number');
    }, 8000);
    check('P6: tank telemetry stored (level)', !!tankSample, tankSample ? `level ${tankSample.values.level} %` : 'none');
    const manual = await http('POST', `/nodes/${TANK_ID}/commands`, { type: 'set_mode', payload: { mode: 'manual' } });
    check('P6: tank command confirmed', (await commandOutcome(manual.data.id, 3000))?.status === 'confirmed');
    const pumpOn = await http('POST', `/nodes/${TANK_ID}/commands`, { type: 'set_pump', payload: { pump: 'on' } });
    check('P6: pump started in manual mode', (await commandOutcome(pumpOn.data.id, 3000))?.status === 'confirmed');
    const tankConfigs = (await http('GET', `/nodes/${TANK_ID}/alarm-configs`)).data as any[];
    check('P6: tank alarms created from its manifest', ['lowLevel', 'overflow'].every((k) => tankConfigs.some((c) => c.key === k)));
    const userAgain = (await http('POST', '/auth/login', { username: 'tony', password: 'tony-e2e-pass' })).data.token as string;
    check('P6: generic permissions apply to the new module (user may set the mode, not the pump)',
      (await http('POST', `/nodes/${TANK_ID}/commands`, { type: 'set_mode', payload: { mode: 'auto' } }, userAgain)).status === 201 &&
        (await http('POST', `/nodes/${TANK_ID}/commands`, { type: 'set_pump', payload: { pump: 'off' } }, userAgain)).status === 403);

    // Node connection data: engineering only; without a supervisor there is no node account
    check('user profile cannot read node connection data', (await http('GET', '/system/node-access', undefined, userAgain)).status === 403);
    check('node connection data reports "not configured" without a supervisor',
      (await http('GET', '/system/node-access')).data.configured === false);

    // RF-06: audit trail
    const kinds = new Set(((await http('GET', `/events?nodeId=${SIM_ID}`)).data as any[]).map((e) => e.kind));
    const expected = ['node.discovered', 'node.approved', 'node.online', 'node.offline', 'command.sent', 'command.confirmed', 'command.rejected'];
    const missing = expected.filter((k) => !kinds.has(k));
    check('audit log records the whole sequence', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${kinds.size} kinds`);
    const nodeEvents = (await http('GET', `/events?nodeId=${SIM_ID}`)).data as any[];
    check('reconnection does not register the node again', nodeEvents.filter((e) => e.kind === 'node.discovered').length === 1);
    const actors = new Set(nodeEvents.filter((e) => e.kind === 'command.sent' || e.kind === 'node.approved').map((e) => e.actor));
    check('audit log names the user behind each action', actors.has('admin') && actors.has('tony'), [...actors].join(', '));
    const all = JSON.stringify((await http('GET', '/events?limit=1000')).data);
    check('audit log never contains passwords', !all.includes('tony-e2e-pass') && !all.includes('admin-e2e-pass'));
  } finally {
    sim?.kill('SIGKILL');
    tank?.kill('SIGKILL');
    server.kill('SIGKILL');
    await sleep(500);
    await clearRetained();
    await probe.endAsync();
    rmSync(workDir, { recursive: true, force: true });
    await broker.stop();
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`e2e aborted: ${(err as Error).message}`);
  process.exitCode = 1;
});

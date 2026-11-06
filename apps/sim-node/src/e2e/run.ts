import { ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AckMessage,
  AckMessageSchema,
  AnnounceMessageSchema,
  PROTOCOL_DEFAULTS,
  TelemetryMessage,
  TelemetryMessageSchema,
  nodeTopic,
} from '@integralo/contract';
import { startTestBroker } from '@integralo/testing';
import mqtt, { MqttClient } from 'mqtt';

/**
 * End-to-end check of the simulated node against a running broker.
 * Starts the node as a separate process and plays the platform's role:
 * identification, telemetry, confirmed commands, duplicates, rejections and Last Will.
 * Usage: pnpm e2e  (broker URL in INTEGRALO_MQTT_URL, default mqtt://localhost:1883)
 */
/** Own temporary broker (see @integralo/testing); set at the start of main(). */
let BROKER = '';
const BROKER_PORT = 1886;
const NODE_ID = 'sim-e2e001';
/** Own topic prefix, so a platform running on the same broker does not see the test node. */
const PREFIX = 'integralo-e2e';
const t = (kind: Parameters<typeof nodeTopic>[1]) => nodeTopic(NODE_ID, kind, PREFIX);

interface Received {
  topic: string;
  text: string;
  at: number;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

class Probe {
  readonly messages: Received[] = [];
  private constructor(readonly client: MqttClient) {
    client.on('message', (topic, payload) => this.messages.push({ topic, text: payload.toString('utf8'), at: Date.now() }));
  }

  static async connect(): Promise<Probe> {
    const client = await mqtt.connectAsync(BROKER, { clientId: `integralo-e2e-probe-${process.pid}`, clean: true });
    return new Probe(client);
  }

  /** Waits for the first message after `since` that matches; null on timeout. */
  async waitFor(match: (m: Received) => boolean, timeoutMs: number, since = 0): Promise<Received | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.messages.find((m) => m.at >= since && match(m));
      if (found) return found;
      await sleep(50);
    }
    return null;
  }

  async command(cmdId: string, type: string, payload: object): Promise<{ ack: AckMessage | null; latencyMs: number }> {
    const sent = Date.now();
    await this.client.publishAsync(t('cmd'), JSON.stringify({ cmdId, type, payload }), { qos: 1 });
    const msg = await this.waitFor((m) => m.topic === t('ack') && JSON.parse(m.text).cmdId === cmdId, 3000, sent);
    return { ack: msg ? AckMessageSchema.parse(JSON.parse(msg.text)) : null, latencyMs: msg ? msg.at - sent : -1 };
  }

  /** Removes the retained messages this test left on the broker. */
  async clearRetained(): Promise<void> {
    for (const kind of ['announce', 'status'] as const) {
      await this.client.publishAsync(t(kind), '', { qos: 1, retain: true });
    }
  }
}

function startNode(stateDir: string): ChildProcess {
  return spawn(process.execPath, [join(__dirname, '..', 'index.js'), '--node-id', NODE_ID, '--state-dir', stateDir, '--broker', BROKER, '--topic-prefix', PREFIX], {
    stdio: 'ignore',
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const broker = await startTestBroker(BROKER_PORT);
  BROKER = broker.url;
  const stateDir = mkdtempSync(join(tmpdir(), 'integralo-e2e-'));
  const probe = await Probe.connect();
  await probe.clearRetained();
  await probe.client.subscribeAsync(`${PREFIX}/nodes/${NODE_ID}/#`, { qos: 1 });

  const started = Date.now();
  let node = startNode(stateDir);
  try {
    // P1: identification
    const announce = await probe.waitFor((m) => m.topic === t('announce') && m.text !== '', 5000, started);
    const parsed = announce ? AnnounceMessageSchema.safeParse(JSON.parse(announce.text)) : null;
    check('announce received and valid', !!parsed?.success, announce ? `${announce.at - started} ms after start` : 'timeout');
    check('announce identifies the module', !!parsed?.success && parsed.data.module === 'temperature' && parsed.data.nodeId === NODE_ID);
    const online = await probe.waitFor((m) => m.topic === t('status') && m.text === 'online', 5000, started);
    check('status online', !!online);

    // P2: telemetry
    const first = await probe.waitFor((m) => m.topic === t('telemetry'), 5000, started);
    const second = first && (await probe.waitFor((m) => m.topic === t('telemetry'), 5000, first.at + 1));
    const tel = (m: Received) => TelemetryMessageSchema.parse(JSON.parse(m.text)) as TelemetryMessage;
    check('telemetry valid and periodic', !!first && !!second && tel(second).seq === tel(first).seq + 1,
      first && second ? `period ${second.at - first.at} ms` : 'timeout');
    check('telemetry carries temperature', !!first && typeof tel(first).values.temperature === 'number');

    // P3: confirmed commands
    const auto = await probe.command('e2e-1', 'set_mode', { mode: 'auto' });
    check('set_mode accepted', auto.ack?.result === 'accepted' && auto.ack.state.mode === 'auto', `${auto.latencyMs} ms`);
    const dup = await probe.command('e2e-1', 'set_mode', { mode: 'off' });
    check('duplicate cmdId answered with the original ack', JSON.stringify(dup.ack) === JSON.stringify(auto.ack));
    const out = await probe.command('e2e-2', 'set_setpoint', { setpoint: 80 });
    check('out-of-range setpoint rejected', out.ack?.result === 'rejected' && out.ack.reason === 'out_of_range');
    const sp = await probe.command('e2e-3', 'set_setpoint', { setpoint: 23 });
    check('valid setpoint accepted', sp.ack?.result === 'accepted' && sp.ack.state.setpoint === 23, `${sp.latencyMs} ms`);

    const beforeGarbage = Date.now();
    await probe.client.publishAsync(t('cmd'), '{not json', { qos: 1 });
    await sleep(1000);
    const alive = await probe.waitFor((m) => m.topic === t('telemetry'), 5000, beforeGarbage);
    check('invalid JSON ignored, node keeps running', !!alive);

    // P4 (partial): abrupt loss of the node → broker publishes its Last Will
    const killed = Date.now();
    node.kill('SIGKILL');
    const offline = await probe.waitFor((m) => m.topic === t('status') && m.text === 'offline', PROTOCOL_DEFAULTS.keepaliveSeconds * 1500 + 2000, killed);
    check('Last Will "offline" after abrupt stop', !!offline, offline ? `${offline.at - killed} ms` : 'timeout');

    // RF-24: state survives a restart
    const restarted = Date.now();
    node = startNode(stateDir);
    await probe.waitFor((m) => m.topic === t('status') && m.text === 'online', 5000, restarted);
    const after = await probe.waitFor((m) => m.topic === t('telemetry'), 5000, restarted);
    check('mode and setpoint recovered after restart',
      !!after && tel(after).values.mode === 'auto' && tel(after).values.setpoint === 23);
  } finally {
    node.kill('SIGKILL');
    await sleep(300);
    await probe.clearRetained();
    await probe.client.endAsync();
    rmSync(stateDir, { recursive: true, force: true });
    await broker.stop();
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`e2e aborted: ${(err as Error).message}`);
  process.exitCode = 1;
});

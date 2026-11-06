import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { NodeBehaviour } from './node/behaviour';
import { SimulatedNode } from './node/mqtt-node';
import { TemperatureBehaviour } from './node/temperature-behaviour';
import { TankBehaviour } from './tank/behaviour';

/**
 * Starts a simulated node of a module.
 * Examples: pnpm sim-node -- --time-scale 60
 *           pnpm sim-node -- --module tank-level --time-scale 60
 *           pnpm sim-node -- --settings ../../.data/settings.json   (broker started by the supervisor)
 * Options can also be given as environment variables (INTEGRALO_MQTT_URL, ...).
 */
const { values } = parseArgs({
  options: {
    module: { type: 'string', default: 'temperature' },
    broker: { type: 'string', default: process.env.INTEGRALO_MQTT_URL ?? 'mqtt://localhost:1883' },
    'node-id': { type: 'string', default: process.env.INTEGRALO_NODE_ID },
    username: { type: 'string', default: process.env.INTEGRALO_MQTT_USERNAME },
    password: { type: 'string', default: process.env.INTEGRALO_MQTT_PASSWORD },
    'state-dir': { type: 'string', default: '.state' },
    'time-scale': { type: 'string', default: '1' },
    /** Initial temperature (°C) or tank level (%). */
    initial: { type: 'string' },
    'topic-prefix': { type: 'string', default: process.env.INTEGRALO_TOPIC_PREFIX },
    /** Supervisor settings.json: takes the broker port, topic prefix and node account from it. */
    settings: { type: 'string' },
  },
});

if (values.settings) {
  const s = JSON.parse(readFileSync(values.settings, 'utf8')) as {
    brokerPort: number;
    topicPrefix: string;
    nodes: { username: string; password: string };
  };
  values.broker = `mqtt://localhost:${s.brokerPort}`;
  values['topic-prefix'] = s.topicPrefix;
  values.username = s.nodes.username;
  values.password = s.nodes.password;
}

/** Simulated modules: id prefix (several modules can run on one computer), default initial value and factory. */
const MODULES: Record<string, { idPrefix: string; initial: number; create: (stateFile: string, initial: number) => NodeBehaviour }> = {
  temperature: { idPrefix: 'sim', initial: 30, create: (file, initial) => new TemperatureBehaviour(file, initial) },
  'tank-level': { idPrefix: 'tank', initial: 50, create: (file, initial) => new TankBehaviour(file, initial) },
};

const selected = MODULES[values.module];
if (!selected) {
  console.error(`unknown module "${values.module}"; available: ${Object.keys(MODULES).join(', ')}`);
  process.exit(1);
}

/**
 * Like the ESP32, the identity derives from a MAC address: prefix + its last 6 hex digits.
 * An ESP32 has one fixed MAC; a PC has several adapters whose order changes (Wi-Fi off,
 * a VPN, a USB adapter), so the first identity is kept in the state folder and reused:
 * otherwise the same simulator would show up as a new node after a network change.
 */
function defaultNodeId(prefix: string, stateDir: string): string {
  const file = join(stateDir, `${prefix}.identity`);
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  }
  let id = `${prefix}-000001`;
  search: for (const addresses of Object.values(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') {
        id = `${prefix}-${a.mac.replace(/:/g, '').slice(-6).toLowerCase()}`;
        break search;
      }
    }
  }
  writeFileSync(file, `${id}
`);
  return id;
}

mkdirSync(values['state-dir'], { recursive: true });
const nodeId = values['node-id'] ?? defaultNodeId(selected.idPrefix, values['state-dir']);

const node = new SimulatedNode({
  brokerUrl: values.broker,
  nodeId,
  username: values.username,
  password: values.password,
  behaviour: selected.create(join(values['state-dir'], `${nodeId}.json`), Number(values.initial ?? selected.initial)),
  timeScale: Number(values['time-scale']),
  topicPrefix: values['topic-prefix'],
});
node.start();

const shutdown = () => {
  node.stop().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

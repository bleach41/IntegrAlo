import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SimulatedNode } from './node/mqtt-node';

/**
 * Starts a simulated temperature node.
 * Example: pnpm sim-node -- --time-scale 60
 * Options can also be given as environment variables (INTEGRALO_MQTT_URL, ...).
 */
const { values } = parseArgs({
  options: {
    broker: { type: 'string', default: process.env.INTEGRALO_MQTT_URL ?? 'mqtt://localhost:1883' },
    'node-id': { type: 'string', default: process.env.INTEGRALO_NODE_ID },
    username: { type: 'string', default: process.env.INTEGRALO_MQTT_USERNAME },
    password: { type: 'string', default: process.env.INTEGRALO_MQTT_PASSWORD },
    'state-dir': { type: 'string', default: '.state' },
    'time-scale': { type: 'string', default: '1' },
    initial: { type: 'string', default: '30' },
    'topic-prefix': { type: 'string', default: process.env.INTEGRALO_TOPIC_PREFIX },
  },
});

/** Like the ESP32, the identity derives from a MAC address: "sim-" + its last 6 hex digits. */
function defaultNodeId(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') {
        return `sim-${a.mac.replace(/:/g, '').slice(-6).toLowerCase()}`;
      }
    }
  }
  return 'sim-000001';
}

const nodeId = values['node-id'] ?? defaultNodeId();
mkdirSync(values['state-dir'], { recursive: true });

const node = new SimulatedNode({
  brokerUrl: values.broker,
  nodeId,
  username: values.username,
  password: values.password,
  stateFile: join(values['state-dir'], `${nodeId}.json`),
  timeScale: Number(values['time-scale']),
  initialTemperatureC: Number(values.initial),
  topicPrefix: values['topic-prefix'],
});
node.start();

const shutdown = () => {
  node.stop().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

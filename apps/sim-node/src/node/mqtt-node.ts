import {
  AckMessage,
  AnnounceMessage,
  DEFAULT_TOPIC_PREFIX,
  NodeTopicKind,
  PROTOCOL_DEFAULTS,
  TOPIC_QOS,
  TOPIC_RETAINED,
  TelemetryMessage,
  nodeTopic,
} from '@integralo/contract';
import mqtt, { MqttClient } from 'mqtt';
import type { NodeBehaviour } from './behaviour';

export const FIRMWARE_VERSION = '0.1.0-sim';

export interface SimulatedNodeOptions {
  brokerUrl: string;
  nodeId: string;
  username?: string;
  password?: string;
  /** Module-specific part: process model, control loop and commands. */
  behaviour: NodeBehaviour;
  /** Simulated seconds per real second. */
  timeScale: number;
  topicPrefix?: string;
  log?: (message: string) => void;
}

/**
 * Simulated node connected by MQTT, behaving as the ESP32 firmware will, for any module:
 * - announces itself and its status (retained; "offline" is its Last Will)
 * - keeps running the control loop while disconnected and reconnects by itself (RF-23)
 * - answers every command with an ack (RF-22); the behaviour persists its state (RF-24)
 */
export class SimulatedNode {
  private client?: MqttClient;
  private timer?: NodeJS.Timeout;
  private periodMs = 0;
  private seq = 0;
  private readonly startedAt = Date.now();
  private readonly behaviour: NodeBehaviour;
  private readonly log: (message: string) => void;

  constructor(private readonly options: SimulatedNodeOptions) {
    this.log = options.log ?? ((m) => console.log(`[${options.nodeId}] ${m}`));
    this.behaviour = options.behaviour;
  }

  start(): void {
    const { brokerUrl, nodeId, username, password } = this.options;
    this.client = mqtt.connect(brokerUrl, {
      clientId: nodeId,
      username,
      password,
      keepalive: PROTOCOL_DEFAULTS.keepaliveSeconds,
      // A clean session discards commands queued while the node was offline:
      // an old command must never be applied on reconnection.
      clean: true,
      reconnectPeriod: 2000,
      // Readings taken while offline are not sent later; gaps in seq show the outage.
      queueQoSZero: false,
      will: {
        topic: this.topic('status'),
        payload: Buffer.from('offline'),
        qos: TOPIC_QOS.status,
        retain: TOPIC_RETAINED.status,
      },
    });

    this.client.on('connect', () => this.onConnect());
    this.client.on('message', (topic, payload) => this.onMessage(topic, payload));
    this.client.on('offline', () => this.log('broker unreachable, control loop keeps running'));
    this.client.on('error', (err) => this.log(`mqtt error: ${err.message}`));

    this.schedule(this.behaviour.samplePeriodMs());
    this.log(`started (${this.behaviour.moduleId}), ${this.behaviour.describe()}`);
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    if (this.client?.connected) {
      await this.client.publishAsync(this.topic('status'), 'offline', {
        qos: TOPIC_QOS.status,
        retain: TOPIC_RETAINED.status,
      });
    }
    await this.client?.endAsync();
  }

  private onConnect(): void {
    this.log(`connected to ${this.options.brokerUrl}`);
    this.publish('status', 'online');
    const announce: AnnounceMessage = {
      nodeId: this.options.nodeId,
      module: this.behaviour.moduleId,
      fw: FIRMWARE_VERSION,
      uptimeMs: Date.now() - this.startedAt,
    };
    this.publish('announce', announce);
    this.client?.subscribe(this.topic('cmd'), { qos: TOPIC_QOS.cmd });
  }

  private onMessage(topic: string, payload: Buffer): void {
    if (topic !== this.topic('cmd')) {
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString('utf8'));
    } catch {
      this.log('ignored command: invalid JSON');
      return;
    }
    const ack: AckMessage | null = this.behaviour.handleCommand(raw);
    if (!ack) {
      this.log('ignored command: no valid cmdId');
      return;
    }
    this.publish('ack', ack);
    this.log(`cmd ${ack.cmdId} ${ack.result}${ack.result === 'rejected' ? ` (${ack.reason})` : ''}`);
    // A command may have changed the telemetry period.
    if (this.behaviour.samplePeriodMs() !== this.periodMs) {
      this.schedule(this.behaviour.samplePeriodMs());
    }
  }

  private schedule(periodMs: number): void {
    clearInterval(this.timer);
    this.periodMs = periodMs;
    this.timer = setInterval(() => this.tick(), periodMs);
  }

  private tick(): void {
    const dtS = (this.periodMs / 1000) * this.options.timeScale;
    const values = this.behaviour.tick(dtS);
    this.seq++;
    if (this.client?.connected) {
      const telemetry: TelemetryMessage = { seq: this.seq, uptimeMs: Date.now() - this.startedAt, values };
      this.publish('telemetry', telemetry);
    }
  }

  private publish(kind: NodeTopicKind, payload: string | object): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.client?.publish(this.topic(kind), body, { qos: TOPIC_QOS[kind], retain: TOPIC_RETAINED[kind] });
  }

  private topic(kind: NodeTopicKind): string {
    return nodeTopic(this.options.nodeId, kind, this.options.topicPrefix ?? DEFAULT_TOPIC_PREFIX);
  }
}

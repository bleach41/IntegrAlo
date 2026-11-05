import {
  NODE_TOPIC_KINDS,
  NodeTopicKind,
  TOPIC_QOS,
  TOPIC_RETAINED,
  nodeTopic,
  nodeTopicFilter,
  parseNodeTopic,
} from '@integralo/contract';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import mqtt, { MqttClient } from 'mqtt';
import { APP_CONFIG, AppConfig } from '../config';

export type NodeMessageHandler = (nodeId: string, payload: Buffer) => void;

/** Topics the core listens to; "cmd" is only published by the core. */
const INBOUND: NodeTopicKind[] = NODE_TOPIC_KINDS.filter((k) => k !== 'cmd');

/**
 * Single MQTT connection of the core. Feature services register a handler per topic
 * kind, so this class knows nothing about nodes, telemetry or commands.
 */
@Injectable()
export class MqttService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private readonly handlers = new Map<NodeTopicKind, NodeMessageHandler[]>();
  private client?: MqttClient;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  on(kind: NodeTopicKind, handler: NodeMessageHandler): void {
    this.handlers.set(kind, [...(this.handlers.get(kind) ?? []), handler]);
  }

  /** Connects after every module has registered its handlers, so retained messages are not missed. */
  onApplicationBootstrap(): void {
    const { mqttUrl, mqttUsername, mqttPassword, topicPrefix } = this.config;
    this.client = mqtt.connect(mqttUrl, {
      clientId: `integralo-core-${process.pid}`,
      username: mqttUsername,
      password: mqttPassword,
      clean: true,
      reconnectPeriod: 2000,
    });
    this.client.on('connect', () => {
      this.logger.log(`connected to ${mqttUrl}`);
      for (const kind of INBOUND) {
        this.client?.subscribe(nodeTopicFilter(kind, topicPrefix), { qos: TOPIC_QOS[kind] });
      }
    });
    this.client.on('offline', () => this.logger.warn('broker unreachable, reconnecting'));
    this.client.on('error', (err) => this.logger.error(`mqtt error: ${err.message}`));
    this.client.on('message', (topic, payload) => this.dispatch(topic, payload));
  }

  /** Forced end: waiting for in-flight messages could block the shutdown indefinitely. */
  async onModuleDestroy(): Promise<void> {
    await this.client?.endAsync(true);
  }

  async publish(nodeId: string, kind: NodeTopicKind, body: string): Promise<void> {
    if (!this.client?.connected) {
      throw new Error('broker not connected');
    }
    await this.client.publishAsync(nodeTopic(nodeId, kind, this.config.topicPrefix), body, {
      qos: TOPIC_QOS[kind],
      retain: TOPIC_RETAINED[kind],
    });
  }

  private dispatch(topic: string, payload: Buffer): void {
    const parsed = parseNodeTopic(topic, this.config.topicPrefix);
    if (!parsed) return;
    for (const handler of this.handlers.get(parsed.kind) ?? []) {
      try {
        handler(parsed.nodeId, payload);
      } catch (err) {
        this.logger.error(`handler for ${parsed.kind} failed: ${(err as Error).message}`);
      }
    }
  }
}

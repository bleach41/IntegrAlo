import { join } from 'node:path';
import { DEFAULT_TOPIC_PREFIX, PROTOCOL_DEFAULTS } from '@integralo/contract';

/** Runtime configuration, from environment variables with local defaults. */
export interface AppConfig {
  port: number;
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  topicPrefix: string;
  databasePath: string;
  modulesDir: string;
  ackTimeoutMs: number;
  retentionDays: number;
  /** An online node without telemetry for this long raises the communication alarm. */
  telemetryTimeoutMs: number;
  /** Exported web client served at "/" (all-in-one installation); none in development. */
  webDir?: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.INTEGRALO_PORT ?? 4100),
    mqttUrl: env.INTEGRALO_MQTT_URL ?? 'mqtt://localhost:1883',
    mqttUsername: env.INTEGRALO_MQTT_USERNAME,
    mqttPassword: env.INTEGRALO_MQTT_PASSWORD,
    topicPrefix: env.INTEGRALO_TOPIC_PREFIX ?? DEFAULT_TOPIC_PREFIX,
    databasePath: env.INTEGRALO_DB_PATH ?? join(process.cwd(), '.state', 'integralo.sqlite'),
    modulesDir: env.INTEGRALO_MODULES_DIR ?? join(__dirname, '..', '..', '..', 'modules'),
    ackTimeoutMs: Number(env.INTEGRALO_ACK_TIMEOUT_MS ?? PROTOCOL_DEFAULTS.ackTimeoutMs),
    retentionDays: Number(env.INTEGRALO_RETENTION_DAYS ?? 60),
    telemetryTimeoutMs: Number(env.INTEGRALO_TELEMETRY_TIMEOUT_MS ?? 30_000),
    webDir: env.INTEGRALO_WEB_DIR,
  };
}

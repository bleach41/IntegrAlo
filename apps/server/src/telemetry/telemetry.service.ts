import { TelemetryMessageSchema, TelemetryValue } from '@integralo/contract';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../bus/event-bus';
import { parseJson } from '../common/json';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { MqttService } from '../mqtt/mqtt.service';
import { NodesService } from '../nodes/nodes.service';

export interface TelemetrySample {
  receivedAt: number;
  seq: number;
  values: Record<string, TelemetryValue>;
}

const DAY_MS = 86_400_000;
const PURGE_INTERVAL_MS = 3_600_000;

/**
 * Stores telemetry of approved nodes (RF-03), timestamped with the platform clock.
 * Data older than the retention period is deleted every hour.
 */
@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
    private readonly nodes: NodesService,
    private readonly bus: EventBus,
    mqtt: MqttService,
  ) {
    mqtt.on('telemetry', (nodeId, payload) => this.onTelemetry(nodeId, payload));
  }

  onModuleInit(): void {
    this.purge();
    this.purgeTimer = setInterval(() => this.purge(), PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.purgeTimer);
  }

  query(nodeId: string, from: number, to: number, limit: number): TelemetrySample[] {
    const rows = this.database.db
      .prepare(
        'SELECT received_at, seq, values_json FROM telemetry WHERE node_id = ? AND received_at BETWEEN ? AND ? ORDER BY received_at LIMIT ?',
      )
      .all(nodeId, from, to, limit) as Array<{ received_at: number; seq: number; values_json: string }>;
    return rows.map((r) => ({ receivedAt: r.received_at, seq: r.seq, values: JSON.parse(r.values_json) }));
  }

  latest(nodeId: string): TelemetrySample | null {
    const row = this.database.db
      .prepare('SELECT received_at, seq, values_json FROM telemetry WHERE node_id = ? ORDER BY id DESC LIMIT 1')
      .get(nodeId) as { received_at: number; seq: number; values_json: string } | undefined;
    return row ? { receivedAt: row.received_at, seq: row.seq, values: JSON.parse(row.values_json) } : null;
  }

  private onTelemetry(nodeId: string, payload: Buffer): void {
    const node = this.nodes.find(nodeId);
    if (!node || node.approval !== 'approved') return; // pending nodes are not recorded
    const result = TelemetryMessageSchema.safeParse(parseJson(payload));
    if (!result.success) {
      this.logger.warn(`invalid telemetry from ${nodeId}`);
      return;
    }
    const now = Date.now();
    this.database.db
      .prepare('INSERT INTO telemetry (node_id, received_at, seq, values_json) VALUES (?, ?, ?, ?)')
      .run(nodeId, now, result.data.seq, JSON.stringify(result.data.values));
    this.nodes.touch(nodeId);
    this.bus.emit('telemetry', { nodeId, sample: { receivedAt: now, seq: result.data.seq, values: result.data.values } });
  }

  private purge(): void {
    const cutoff = Date.now() - this.config.retentionDays * DAY_MS;
    const { changes } = this.database.db.prepare('DELETE FROM telemetry WHERE received_at < ?').run(cutoff);
    if (Number(changes) > 0) {
      this.logger.log(`retention: deleted ${changes} telemetry rows older than ${this.config.retentionDays} days`);
    }
  }
}

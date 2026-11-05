import { Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../bus/event-bus';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { NodeInfo, NodesService } from '../nodes/nodes.service';
import { ModuleRegistryService } from '../registry/module-registry.service';

/** Built-in alarm of every approved node, independent of its module. */
export const COMM_LOSS = 'commLoss';
const WATCHDOG_INTERVAL_MS = 5000;

export type AlarmState = 'active' | 'acknowledged' | 'cleared' | 'closed';

export interface AlarmRecord {
  id: number;
  nodeId: string;
  key: string;
  /** active: not acknowledged; acknowledged: still active; cleared: back to normal but not acknowledged; closed: both. */
  state: AlarmState;
  raisedAt: number;
  raisedValue: number | null;
  detail: string | null;
  ackedAt: number | null;
  ackedBy: string | null;
  clearedAt: number | null;
  clearedValue: number | null;
}

export interface AlarmConfig {
  key: string;
  variable: string;
  type: 'high' | 'low';
  threshold: number;
  deadband: number;
  enabled: boolean;
}

interface AlarmRow {
  id: number;
  node_id: string;
  alarm_key: string;
  raised_at: number;
  raised_value: number | null;
  detail: string | null;
  acked_at: number | null;
  acked_by: string | null;
  cleared_at: number | null;
  cleared_value: number | null;
}

/**
 * Alarms (RF-05) with the three moments of a SCADA alarm: raised, acknowledged by a
 * person, and cleared when the condition returns to normal. An occurrence is closed only
 * when it is both acknowledged and cleared.
 * - Threshold alarms come from the module manifest; a deadband avoids chattering:
 *   a high alarm raised above T clears only below T − deadband.
 * - The communication alarm is raised when an approved node goes offline or stops
 *   sending telemetry, and clears when telemetry arrives again.
 */
@Injectable()
export class AlarmsService implements OnModuleInit, OnModuleDestroy {
  private readonly lastTelemetry = new Map<string, number>();
  private readonly startedAt = Date.now();
  private watchdog?: NodeJS.Timeout;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly nodes: NodesService,
    private readonly registry: ModuleRegistryService,
    private readonly bus: EventBus,
  ) {
    bus.on('telemetry', ({ nodeId, sample }) => this.onTelemetry(nodeId, sample.values));
    bus.on('node', (node) => this.onNode(node));
  }

  onModuleInit(): void {
    for (const node of this.nodes.list()) {
      if (node.approval === 'approved') this.ensureConfigs(node);
    }
    this.watchdog = setInterval(() => this.checkSilentNodes(), WATCHDOG_INTERVAL_MS);
    this.watchdog.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.watchdog);
  }

  list(options: { nodeId?: string; open: boolean; limit: number }): AlarmRecord[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (options.nodeId) {
      where.push('node_id = ?');
      params.push(options.nodeId);
    }
    if (options.open) where.push('(cleared_at IS NULL OR acked_at IS NULL)');
    const sql = `SELECT * FROM alarms ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
    const rows = this.database.db.prepare(sql).all(...params, options.limit) as unknown as AlarmRow[];
    return rows.map(toRecord);
  }

  acknowledge(id: number, actor: string): AlarmRecord {
    const row = this.row(id);
    if (row.acked_at === null) {
      this.database.db.prepare('UPDATE alarms SET acked_at = ?, acked_by = ? WHERE id = ?').run(Date.now(), actor, id);
      this.events.record('alarm.acknowledged', row.node_id, actor, { alarmId: id, key: row.alarm_key });
      this.publish(id);
    }
    return toRecord(this.row(id));
  }

  configs(nodeId: string): AlarmConfig[] {
    this.nodes.get(nodeId);
    const rows = this.database.db.prepare('SELECT * FROM alarm_configs WHERE node_id = ? ORDER BY alarm_key').all(nodeId) as Array<{
      alarm_key: string;
      variable: string;
      type: 'high' | 'low';
      threshold: number;
      deadband: number;
      enabled: number;
    }>;
    return rows.map((r) => ({
      key: r.alarm_key,
      variable: r.variable,
      type: r.type,
      threshold: r.threshold,
      deadband: r.deadband,
      enabled: r.enabled === 1,
    }));
  }

  configure(nodeId: string, key: string, changes: Partial<Pick<AlarmConfig, 'threshold' | 'deadband' | 'enabled'>>, actor: string): AlarmConfig {
    const current = this.configs(nodeId).find((c) => c.key === key);
    if (!current) throw new NotFoundException(`node ${nodeId} has no alarm ${key}`);
    const next = { ...current, ...changes };
    this.database.db
      .prepare('UPDATE alarm_configs SET threshold = ?, deadband = ?, enabled = ? WHERE node_id = ? AND alarm_key = ?')
      .run(next.threshold, next.deadband, next.enabled ? 1 : 0, nodeId, key);
    this.events.record('alarm.configured', nodeId, actor, { key, ...changes });
    return next;
  }

  private onNode(node: NodeInfo): void {
    if (node.approval !== 'approved') return;
    this.ensureConfigs(node);
    if (!node.online) this.raise(node.id, COMM_LOSS, null, 'offline');
  }

  private onTelemetry(nodeId: string, values: Record<string, unknown>): void {
    this.lastTelemetry.set(nodeId, Date.now());
    this.clear(nodeId, COMM_LOSS, null);

    for (const config of this.configs(nodeId)) {
      const value = values[config.variable];
      if (!config.enabled || typeof value !== 'number') continue;
      const active = this.activeRow(nodeId, config.key) !== undefined;
      if (config.type === 'high') {
        if (!active && value > config.threshold) this.raise(nodeId, config.key, value, `> ${config.threshold}`);
        else if (active && value <= config.threshold - config.deadband) this.clear(nodeId, config.key, value);
      } else {
        if (!active && value < config.threshold) this.raise(nodeId, config.key, value, `< ${config.threshold}`);
        else if (active && value >= config.threshold + config.deadband) this.clear(nodeId, config.key, value);
      }
    }
  }

  /** Detects nodes that look online but stopped sending telemetry (e.g. Wi-Fi lost without disconnecting). */
  private checkSilentNodes(): void {
    const now = Date.now();
    for (const node of this.nodes.list()) {
      if (node.approval !== 'approved' || !node.online) continue;
      const last = this.lastTelemetry.get(node.id) ?? this.startedAt;
      if (now - last > this.config.telemetryTimeoutMs) this.raise(node.id, COMM_LOSS, null, 'no_telemetry');
    }
  }

  private ensureConfigs(node: NodeInfo): void {
    const manifest = this.registry.get(node.module);
    if (!manifest) return;
    const insert = this.database.db.prepare(
      'INSERT OR IGNORE INTO alarm_configs (node_id, alarm_key, variable, type, threshold, deadband, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const alarm of manifest.alarms) {
      const hasDefault = alarm.defaultThreshold !== undefined;
      insert.run(node.id, alarm.key, alarm.variable, alarm.type, alarm.defaultThreshold ?? 0, alarm.defaultDeadband ?? 0, hasDefault ? 1 : 0);
    }
  }

  private raise(nodeId: string, key: string, value: number | null, detail: string): void {
    if (this.activeRow(nodeId, key)) return;
    const { lastInsertRowid } = this.database.db
      .prepare('INSERT INTO alarms (node_id, alarm_key, raised_at, raised_value, detail) VALUES (?, ?, ?, ?, ?)')
      .run(nodeId, key, Date.now(), value, detail);
    this.events.record('alarm.raised', nodeId, 'system', { alarmId: Number(lastInsertRowid), key, value, detail });
    this.publish(Number(lastInsertRowid));
  }

  private clear(nodeId: string, key: string, value: number | null): void {
    const row = this.activeRow(nodeId, key);
    if (!row) return;
    this.database.db.prepare('UPDATE alarms SET cleared_at = ?, cleared_value = ? WHERE id = ?').run(Date.now(), value, row.id);
    this.events.record('alarm.cleared', nodeId, 'system', { alarmId: row.id, key, value });
    this.publish(row.id);
  }

  private activeRow(nodeId: string, key: string): AlarmRow | undefined {
    return this.database.db
      .prepare('SELECT * FROM alarms WHERE node_id = ? AND alarm_key = ? AND cleared_at IS NULL ORDER BY id DESC LIMIT 1')
      .get(nodeId, key) as AlarmRow | undefined;
  }

  private row(id: number): AlarmRow {
    const row = this.database.db.prepare('SELECT * FROM alarms WHERE id = ?').get(id) as AlarmRow | undefined;
    if (!row) throw new NotFoundException(`alarm ${id} not found`);
    return row;
  }

  private publish(id: number): void {
    this.bus.emit('alarm', toRecord(this.row(id)));
  }
}

function toRecord(row: AlarmRow): AlarmRecord {
  const acked = row.acked_at !== null;
  const cleared = row.cleared_at !== null;
  return {
    id: row.id,
    nodeId: row.node_id,
    key: row.alarm_key,
    state: cleared ? (acked ? 'closed' : 'cleared') : acked ? 'acknowledged' : 'active',
    raisedAt: row.raised_at,
    raisedValue: row.raised_value,
    detail: row.detail,
    ackedAt: row.acked_at,
    ackedBy: row.acked_by,
    clearedAt: row.cleared_at,
    clearedValue: row.cleared_value,
  };
}

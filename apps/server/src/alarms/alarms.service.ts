import type { AlarmRecord } from '@integralo/contract';
import { Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../bus/event-bus';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { NodeInfo, NodesService } from '../nodes/nodes.service';
import { ModuleRegistryService } from '../registry/module-registry.service';

export type { AlarmRecord };

/** Built-in alarm of every approved node, independent of its module. */
export const COMM_LOSS = 'commLoss';
const WATCHDOG_INTERVAL_MS = 5000;

export interface AlarmConfig {
  key: string;
  variable: string;
  type: 'high' | 'low';
  threshold: number;
  deadband: number;
  /** Seconds the condition must last before the alarm is raised. */
  delayS: number;
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
  count: number;
  last_raised_at: number | null;
}

interface ConfigRow {
  alarm_key: string;
  variable: string;
  type: 'high' | 'low';
  threshold: number;
  deadband: number;
  delay_s: number;
  enabled: number;
}

/**
 * Alarms (RF-05) with the three moments of a SCADA alarm: raised, acknowledged by a
 * person, and cleared when the condition returns to normal. Following ISA-18.2, an alarm
 * is a state of one point (node + alarm), not a message per event:
 * - while an occurrence is not acknowledged, a new activation reuses it (count + 1), so
 *   the list never grows beyond the number of alarm points;
 * - an occurrence is closed only when it is both acknowledged and cleared; the next
 *   activation starts a new one.
 * Chattering is filtered twice: a deadband (a high alarm raised above T clears only below
 * T − deadband) and an on-delay (the condition must last delayS seconds).
 * The communication alarm is raised when an approved node goes offline or stops sending
 * telemetry, and clears when telemetry arrives again.
 */
@Injectable()
export class AlarmsService implements OnModuleInit, OnModuleDestroy {
  private readonly lastTelemetry = new Map<string, number>();
  /** When each threshold condition started to hold, for the on-delay ("node:key" → ms). */
  private readonly pendingSince = new Map<string, number>();
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
    const rows = this.database.db
      .prepare('SELECT * FROM alarm_configs WHERE node_id = ? ORDER BY alarm_key')
      .all(nodeId) as unknown as ConfigRow[];
    return rows.map((r) => ({
      key: r.alarm_key,
      variable: r.variable,
      type: r.type,
      threshold: r.threshold,
      deadband: r.deadband,
      delayS: r.delay_s,
      enabled: r.enabled === 1,
    }));
  }

  configure(
    nodeId: string,
    key: string,
    changes: Partial<Pick<AlarmConfig, 'threshold' | 'deadband' | 'delayS' | 'enabled'>>,
    actor: string,
  ): AlarmConfig {
    const current = this.configs(nodeId).find((c) => c.key === key);
    if (!current) throw new NotFoundException(`node ${nodeId} has no alarm ${key}`);
    const next = { ...current, ...changes };
    this.database.db
      .prepare('UPDATE alarm_configs SET threshold = ?, deadband = ?, delay_s = ?, enabled = ? WHERE node_id = ? AND alarm_key = ?')
      .run(next.threshold, next.deadband, next.delayS, next.enabled ? 1 : 0, nodeId, key);
    this.pendingSince.delete(`${nodeId}:${key}`);
    this.events.record('alarm.configured', nodeId, actor, { key, ...changes });
    return next;
  }

  private onNode(node: NodeInfo): void {
    if (node.approval !== 'approved') return;
    this.ensureConfigs(node);
    if (!node.online) this.raise(node.id, COMM_LOSS, null, 'offline');
  }

  private onTelemetry(nodeId: string, values: Record<string, unknown>): void {
    const now = Date.now();
    this.lastTelemetry.set(nodeId, now);
    this.clear(nodeId, COMM_LOSS, null);

    for (const config of this.configs(nodeId)) {
      const value = values[config.variable];
      const pendingKey = `${nodeId}:${config.key}`;
      if (!config.enabled || typeof value !== 'number') {
        this.pendingSince.delete(pendingKey);
        continue;
      }
      const high = config.type === 'high';
      const exceeded = high ? value > config.threshold : value < config.threshold;
      const normal = high ? value <= config.threshold - config.deadband : value >= config.threshold + config.deadband;
      const active = this.activeRow(nodeId, config.key) !== undefined;

      if (!exceeded) this.pendingSince.delete(pendingKey);
      if (exceeded && !active) {
        const since = this.pendingSince.get(pendingKey) ?? now;
        this.pendingSince.set(pendingKey, since);
        if (now - since >= config.delayS * 1000) {
          this.pendingSince.delete(pendingKey);
          this.raise(nodeId, config.key, value, `${high ? '>' : '<'} ${config.threshold}`);
        }
      } else if (normal && active) {
        this.clear(nodeId, config.key, value);
      }
    }
  }

  /** Detects nodes that look online but stopped sending telemetry (e.g. Wi-Fi lost without disconnecting). */
  private checkSilentNodes(): void {
    const now = Date.now();
    for (const node of this.nodes.list()) {
      if (node.approval !== 'approved' || !node.online) continue;
      // A node approved just now has had no chance to send anything yet.
      const last = this.lastTelemetry.get(node.id) ?? Math.max(this.startedAt, node.approvedAt ?? 0);
      if (now - last > this.config.telemetryTimeoutMs) {
        this.raise(node.id, COMM_LOSS, null, 'no_telemetry');
        this.nodes.setOnline(node.id, false, 'no_telemetry');
      }
    }
  }

  private ensureConfigs(node: NodeInfo): void {
    const manifest = this.registry.get(node.module);
    if (!manifest) return;
    const insert = this.database.db.prepare(
      `INSERT OR IGNORE INTO alarm_configs (node_id, alarm_key, variable, type, threshold, deadband, delay_s, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const alarm of manifest.alarms) {
      const hasDefault = alarm.defaultThreshold !== undefined;
      insert.run(
        node.id,
        alarm.key,
        alarm.variable,
        alarm.type,
        alarm.defaultThreshold ?? 0,
        alarm.defaultDeadband ?? 0,
        alarm.defaultDelayS ?? 0,
        hasDefault ? 1 : 0,
      );
    }
  }

  /** Raises the alarm, or reactivates its unacknowledged occurrence instead of creating another. */
  private raise(nodeId: string, key: string, value: number | null, detail: string): void {
    const open = this.openRow(nodeId, key);
    if (open && open.cleared_at === null) return; // already active
    const now = Date.now();
    let id: number;
    if (open) {
      this.database.db
        .prepare('UPDATE alarms SET cleared_at = NULL, cleared_value = NULL, count = count + 1, last_raised_at = ? WHERE id = ?')
        .run(now, open.id);
      id = open.id;
    } else {
      const { lastInsertRowid } = this.database.db
        .prepare('INSERT INTO alarms (node_id, alarm_key, raised_at, last_raised_at, raised_value, detail) VALUES (?, ?, ?, ?, ?, ?)')
        .run(nodeId, key, now, now, value, detail);
      id = Number(lastInsertRowid);
    }
    this.events.record('alarm.raised', nodeId, 'system', { alarmId: id, key, value, detail, reactivated: !!open });
    this.publish(id);
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

  /** The occurrence not yet closed (active, or cleared but unacknowledged). */
  private openRow(nodeId: string, key: string): AlarmRow | undefined {
    return this.database.db
      .prepare(
        'SELECT * FROM alarms WHERE node_id = ? AND alarm_key = ? AND (cleared_at IS NULL OR acked_at IS NULL) ORDER BY id DESC LIMIT 1',
      )
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
    count: row.count,
    lastRaisedAt: row.last_raised_at ?? row.raised_at,
    raisedValue: row.raised_value,
    detail: row.detail,
    ackedAt: row.acked_at,
    ackedBy: row.acked_by,
    clearedAt: row.cleared_at,
    clearedValue: row.cleared_value,
  };
}

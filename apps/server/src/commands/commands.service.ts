import { randomUUID } from 'node:crypto';
import { AckMessageSchema, CommandStatus, TelemetryValue } from '@integralo/contract';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseJson } from '../common/json';
import { APP_CONFIG, AppConfig } from '../config';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { MqttService } from '../mqtt/mqtt.service';
import { NodesService } from '../nodes/nodes.service';
import { ModuleRegistryService } from '../registry/module-registry.service';

export interface CommandRecord {
  id: string;
  nodeId: string;
  type: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  reason: string | null;
  state: Record<string, TelemetryValue> | null;
  sentAt: number;
  resolvedAt: number | null;
}

interface CommandRow {
  id: string;
  node_id: string;
  type: string;
  payload_json: string;
  status: CommandStatus;
  reason: string | null;
  state_json: string | null;
  sent_at: number;
  resolved_at: number | null;
}

/**
 * Confirmed commands (RF-04): sent → confirmed | rejected | unconfirmed.
 * Every command ends in a final state: if no ack arrives within the timeout it becomes
 * "unconfirmed" and is not retried, so an old command is never applied late.
 * The core only checks that the module declares the command; the node validates the payload.
 */
@Injectable()
export class CommandsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommandsService.name);
  private readonly timeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly nodes: NodesService,
    private readonly registry: ModuleRegistryService,
    private readonly mqtt: MqttService,
  ) {
    mqtt.on('ack', (nodeId, payload) => this.onAck(nodeId, payload));
  }

  /** Commands left "sent" by a previous run can no longer be confirmed. */
  onModuleInit(): void {
    const { changes } = this.database.db
      .prepare("UPDATE commands SET status = 'unconfirmed', reason = 'server_restart', resolved_at = ? WHERE status = 'sent'")
      .run(Date.now());
    if (Number(changes) > 0) this.logger.warn(`${changes} pending commands marked unconfirmed after restart`);
  }

  onModuleDestroy(): void {
    for (const timer of this.timeouts.values()) clearTimeout(timer);
  }

  async send(nodeId: string, type: string, payload: Record<string, unknown>, actor: string): Promise<CommandRecord> {
    const node = this.nodes.get(nodeId);
    if (node.approval !== 'approved') throw new ConflictException(`node ${nodeId} is not approved`);
    if (!node.online) throw new ConflictException(`node ${nodeId} is offline`);
    const manifest = this.registry.get(node.module);
    if (!manifest?.commands.includes(type)) {
      throw new BadRequestException(`module ${node.module} has no command "${type}"`);
    }

    const id = randomUUID();
    const sentAt = Date.now();
    this.database.db
      .prepare("INSERT INTO commands (id, node_id, type, payload_json, status, sent_at) VALUES (?, ?, ?, ?, 'sent', ?)")
      .run(id, nodeId, type, JSON.stringify(payload), sentAt);
    try {
      await this.mqtt.publish(nodeId, 'cmd', JSON.stringify({ cmdId: id, type, payload }));
    } catch (err) {
      this.resolve(id, 'unconfirmed', 'broker_unavailable', null);
      throw new ServiceUnavailableException((err as Error).message);
    }
    this.events.record('command.sent', nodeId, actor, { cmdId: id, type, payload });
    this.timeouts.set(
      id,
      setTimeout(() => this.onTimeout(id), this.config.ackTimeoutMs),
    );
    return this.get(id);
  }

  get(id: string): CommandRecord {
    const row = this.database.db.prepare('SELECT * FROM commands WHERE id = ?').get(id) as CommandRow | undefined;
    if (!row) throw new NotFoundException(`command ${id} not found`);
    return toRecord(row);
  }

  list(nodeId: string, limit: number): CommandRecord[] {
    const rows = this.database.db
      .prepare('SELECT * FROM commands WHERE node_id = ? ORDER BY sent_at DESC LIMIT ?')
      .all(nodeId, limit) as unknown as CommandRow[];
    return rows.map(toRecord);
  }

  private onAck(nodeId: string, payload: Buffer): void {
    const result = AckMessageSchema.safeParse(parseJson(payload));
    if (!result.success) {
      this.logger.warn(`invalid ack from ${nodeId}`);
      return;
    }
    const ack = result.data;
    const row = this.database.db.prepare('SELECT * FROM commands WHERE id = ? AND node_id = ?').get(ack.cmdId, nodeId) as
      | CommandRow
      | undefined;
    if (!row) return;
    if (row.status !== 'sent') {
      // Answer to a command already closed (duplicate or arrived after the timeout).
      if (row.status === 'unconfirmed') this.events.record('command.late_ack', nodeId, 'system', { cmdId: ack.cmdId, result: ack.result });
      return;
    }
    if (ack.result === 'accepted') {
      this.resolve(ack.cmdId, 'confirmed', null, ack.state);
      this.events.record('command.confirmed', nodeId, 'system', { cmdId: ack.cmdId, latencyMs: Date.now() - row.sent_at });
    } else {
      this.resolve(ack.cmdId, 'rejected', ack.reason, null);
      this.events.record('command.rejected', nodeId, 'system', { cmdId: ack.cmdId, reason: ack.reason });
    }
  }

  private onTimeout(id: string): void {
    this.timeouts.delete(id);
    const row = this.database.db.prepare('SELECT node_id, status FROM commands WHERE id = ?').get(id) as
      | { node_id: string; status: CommandStatus }
      | undefined;
    if (row?.status !== 'sent') return;
    this.resolve(id, 'unconfirmed', 'ack_timeout', null);
    this.events.record('command.unconfirmed', row.node_id, 'system', { cmdId: id, timeoutMs: this.config.ackTimeoutMs });
  }

  private resolve(id: string, status: CommandStatus, reason: string | null, state: Record<string, TelemetryValue> | null): void {
    clearTimeout(this.timeouts.get(id));
    this.timeouts.delete(id);
    this.database.db
      .prepare('UPDATE commands SET status = ?, reason = ?, state_json = ?, resolved_at = ? WHERE id = ?')
      .run(status, reason, state ? JSON.stringify(state) : null, Date.now(), id);
  }
}

function toRecord(row: CommandRow): CommandRecord {
  return {
    id: row.id,
    nodeId: row.node_id,
    type: row.type,
    payload: JSON.parse(row.payload_json),
    status: row.status,
    reason: row.reason,
    state: row.state_json ? JSON.parse(row.state_json) : null,
    sentAt: row.sent_at,
    resolvedAt: row.resolved_at,
  };
}

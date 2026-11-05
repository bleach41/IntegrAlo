import { AnnounceMessageSchema, NodeStatusSchema } from '@integralo/contract';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '../bus/event-bus';
import { parseJson } from '../common/json';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { MqttService } from '../mqtt/mqtt.service';
import { ModuleRegistryService } from '../registry/module-registry.service';

export type Approval = 'pending' | 'approved';

export interface NodeInfo {
  id: string;
  module: string;
  fw: string;
  name: string | null;
  approval: Approval;
  online: boolean;
  firstSeen: number;
  lastSeen: number;
  approvedAt: number | null;
}

interface NodeRow {
  id: string;
  module: string;
  fw: string;
  name: string | null;
  approval: Approval;
  online: number;
  first_seen: number;
  last_seen: number;
  approved_at: number | null;
}

/**
 * Node registry (RF-01) and connection status (RF-02).
 * A node that announces itself for the first time stays pending until it is approved;
 * an approved node is recognised again on every reconnection.
 */
@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly events: EventsService,
    private readonly registry: ModuleRegistryService,
    private readonly bus: EventBus,
    mqtt: MqttService,
  ) {
    mqtt.on('announce', (nodeId, payload) => this.onAnnounce(nodeId, payload));
    mqtt.on('status', (nodeId, payload) => this.onStatus(nodeId, payload));
  }

  list(): NodeInfo[] {
    const rows = this.database.db.prepare('SELECT * FROM nodes ORDER BY first_seen').all() as unknown as NodeRow[];
    return rows.map(toInfo);
  }

  find(id: string): NodeInfo | undefined {
    const row = this.database.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined;
    return row && toInfo(row);
  }

  get(id: string): NodeInfo {
    const node = this.find(id);
    if (!node) throw new NotFoundException(`node ${id} not found`);
    return node;
  }

  approve(id: string, name: string | undefined, actor: string): NodeInfo {
    const node = this.get(id);
    if (node.approval === 'approved') {
      throw new ConflictException(`node ${id} is already approved`);
    }
    this.database.db
      .prepare("UPDATE nodes SET approval = 'approved', approved_at = ?, name = COALESCE(?, name) WHERE id = ?")
      .run(Date.now(), name ?? null, id);
    this.events.record('node.approved', id, actor, { name: name ?? null });
    const approved = this.get(id);
    this.bus.emit('node', approved);
    return approved;
  }

  touch(id: string): void {
    this.database.db.prepare('UPDATE nodes SET last_seen = ? WHERE id = ?').run(Date.now(), id);
  }

  private onAnnounce(nodeId: string, payload: Buffer): void {
    const raw = parseJson(payload);
    if (raw === undefined) return;
    const result = AnnounceMessageSchema.safeParse(raw);
    if (!result.success || result.data.nodeId !== nodeId) {
      this.logger.warn(`invalid announce from ${nodeId}`);
      return;
    }
    const announce = result.data;
    if (!this.registry.get(announce.module)) {
      this.logger.warn(`node ${nodeId} announced unknown module "${announce.module}"`);
      return;
    }

    // A node announces itself on every connection, so an announce also means it is online.
    // This matters for a new node, whose first "online" status may arrive before it is registered.
    const now = Date.now();
    const existing = this.find(nodeId);
    if (!existing) {
      this.database.db
        .prepare('INSERT INTO nodes (id, module, fw, online, first_seen, last_seen) VALUES (?, ?, ?, 1, ?, ?)')
        .run(nodeId, announce.module, announce.fw, now, now);
      this.events.record('node.discovered', nodeId, 'system', { module: announce.module, fw: announce.fw });
      this.events.record('node.online', nodeId, 'system');
      this.logger.log(`new node ${nodeId} (${announce.module}) pending approval`);
    } else {
      this.database.db
        .prepare('UPDATE nodes SET module = ?, fw = ?, online = 1, last_seen = ? WHERE id = ?')
        .run(announce.module, announce.fw, now, nodeId);
      if (!existing.online) this.events.record('node.online', nodeId, 'system');
    }
    this.bus.emit('node', this.get(nodeId));
  }

  private onStatus(nodeId: string, payload: Buffer): void {
    const result = NodeStatusSchema.safeParse(payload.toString('utf8'));
    const node = this.find(nodeId);
    if (!result.success || !node) return;
    const online = result.data === 'online';
    if (online === node.online) return;
    this.database.db.prepare('UPDATE nodes SET online = ?, last_seen = ? WHERE id = ?').run(online ? 1 : 0, Date.now(), nodeId);
    this.events.record(online ? 'node.online' : 'node.offline', nodeId, 'system');
    this.bus.emit('node', this.get(nodeId));
  }
}

function toInfo(row: NodeRow): NodeInfo {
  return {
    id: row.id,
    module: row.module,
    fw: row.fw,
    name: row.name,
    approval: row.approval,
    online: row.online === 1,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    approvedAt: row.approved_at,
  };
}

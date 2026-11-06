import { AnnounceMessageSchema, NodeStatusSchema } from '@integralo/contract';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '../bus/event-bus';
import { parseJson } from '../common/json';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { MqttService } from '../mqtt/mqtt.service';
import { ModuleRegistryService } from '../registry/module-registry.service';

import type { Approval, NodeInfo } from '@integralo/contract';

export type { NodeInfo };

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
  retired_at: number | null;
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
    private readonly mqtt: MqttService,
  ) {
    mqtt.on('announce', (nodeId, payload) => this.onAnnounce(nodeId, payload));
    mqtt.on('status', (nodeId, payload) => this.onStatus(nodeId, payload));
  }

  list(): NodeInfo[] {
    const rows = this.database.db.prepare('SELECT * FROM nodes WHERE retired_at IS NULL ORDER BY first_seen').all() as unknown as NodeRow[];
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

  rename(id: string, name: string | null, actor: string): NodeInfo {
    const node = this.get(id);
    this.database.db.prepare('UPDATE nodes SET name = ? WHERE id = ?').run(name, id);
    this.events.record('node.renamed', id, actor, { from: node.name, to: name });
    const renamed = this.get(id);
    this.bus.emit('node', renamed);
    return renamed;
  }

  /**
   * Takes a node out of the list without deleting anything: telemetry, commands and the
   * audit log keep its history. It goes back to pending, so it stops being supervised (no
   * telemetry stored, no alarms) and, if it ever reconnects, it shows up for approval again.
   */
  retire(id: string, actor: string): void {
    const node = this.get(id);
    if (node.online) throw new ConflictException(`node ${id} is online; only offline nodes can be retired`);
    this.database.db.prepare("UPDATE nodes SET approval = 'pending', approved_at = NULL, retired_at = ? WHERE id = ?").run(Date.now(), id);
    this.events.record('node.retired', id, actor, { name: node.name });
    this.bus.emit('node', this.get(id));
    // Otherwise its retained announce would bring it back as pending on every restart.
    this.mqtt.clearRetained(id).catch((err) => this.logger.warn(`could not clear retained messages of ${id}: ${String(err)}`));
  }

  /** A reading arrived: the node is alive, whatever its last status said. */
  touch(id: string): void {
    this.database.db.prepare('UPDATE nodes SET last_seen = ? WHERE id = ?').run(Date.now(), id);
    this.setOnline(id, true);
  }

  /**
   * Changes the connection state and tells everyone. Besides the node's own status
   * messages, the alarm watchdog uses it to mark offline a node that went silent: a
   * retained "online" left in the broker by a node that died with the broker down would
   * otherwise keep it online for ever, and commands sent to it would never be confirmed.
   */
  setOnline(id: string, online: boolean, reason?: string): void {
    const node = this.find(id);
    if (!node || node.online === online) return;
    this.database.db.prepare('UPDATE nodes SET online = ?, last_seen = ? WHERE id = ?').run(online ? 1 : 0, Date.now(), id);
    this.events.record(online ? 'node.online' : 'node.offline', id, 'system', reason ? { reason } : undefined);
    this.bus.emit('node', this.get(id));
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
        .prepare('UPDATE nodes SET module = ?, fw = ?, online = 1, last_seen = ?, retired_at = NULL WHERE id = ?')
        .run(announce.module, announce.fw, now, nodeId);
      if (existing.retiredAt !== null) {
        this.events.record('node.discovered', nodeId, 'system', { module: announce.module, fw: announce.fw, returned: true });
        this.logger.log(`retired node ${nodeId} is back, pending approval`);
      }
      if (!existing.online) this.events.record('node.online', nodeId, 'system');
    }
    this.bus.emit('node', this.get(nodeId));
  }

  private onStatus(nodeId: string, payload: Buffer): void {
    const result = NodeStatusSchema.safeParse(payload.toString('utf8'));
    if (!result.success) return;
    this.setOnline(nodeId, result.data === 'online');
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
    retiredAt: row.retired_at,
  };
}

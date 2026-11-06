import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type EventKind =
  | 'node.discovered'
  | 'node.approved'
  | 'node.online'
  | 'node.offline'
  | 'node.renamed'
  | 'node.retired'
  | 'node.revoked'
  | 'command.sent'
  | 'command.confirmed'
  | 'command.rejected'
  | 'command.unconfirmed'
  | 'command.late_ack'
  | 'setup.completed'
  | 'user.login'
  | 'user.login_failed'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'role.updated'
  | 'alarm.raised'
  | 'alarm.acknowledged'
  | 'alarm.cleared'
  | 'alarm.configured'
  | 'system.node_access_viewed';

export const EVENT_CATEGORIES = ['node', 'command', 'alarm', 'user', 'system'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

const CATEGORY_PREFIXES: Record<EventCategory, string[]> = {
  node: ['node'],
  command: ['command'],
  alarm: ['alarm'],
  user: ['user', 'setup', 'role'],
  system: ['system'],
};

export interface AuditEvent {
  id: number;
  at: number;
  kind: EventKind;
  nodeId: string | null;
  actor: string;
  detail: unknown;
}

/** Audit log (requirement RF-06): who did what, when. The actor is a username or "system". */
@Injectable()
export class EventsService {
  constructor(private readonly database: DatabaseService) {}

  record(kind: EventKind, nodeId: string | null, actor: string, detail?: unknown): void {
    this.database.db
      .prepare('INSERT INTO events (at, kind, node_id, actor, detail_json) VALUES (?, ?, ?, ?, ?)')
      .run(Date.now(), kind, nodeId, actor, detail === undefined ? null : JSON.stringify(detail));
  }

  /**
   * Newest first. `category` filters by the kind prefix (users also include setup and roles);
   * `beforeId` pages backwards, so a client can load older events in blocks.
   */
  list(options: { nodeId?: string; category?: EventCategory; beforeId?: number; limit: number }): AuditEvent[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (options.nodeId) {
      where.push('node_id = ?');
      params.push(options.nodeId);
    }
    if (options.category) {
      const prefixes = CATEGORY_PREFIXES[options.category];
      where.push(`(${prefixes.map(() => 'kind LIKE ?').join(' OR ')})`);
      params.push(...prefixes.map((p) => `${p}.%`));
    }
    if (options.beforeId !== undefined) {
      where.push('id < ?');
      params.push(options.beforeId);
    }
    const sql = `SELECT * FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
    const rows = this.database.db.prepare(sql).all(...params, options.limit) as unknown as Array<{
      id: number;
      at: number;
      kind: EventKind;
      node_id: string | null;
      actor: string;
      detail_json: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      kind: r.kind,
      nodeId: r.node_id,
      actor: r.actor,
      detail: r.detail_json ? JSON.parse(r.detail_json) : null,
    }));
  }
}

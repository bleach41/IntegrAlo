import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type EventKind =
  | 'node.discovered'
  | 'node.approved'
  | 'node.online'
  | 'node.offline'
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

  list(options: { nodeId?: string; limit: number }): AuditEvent[] {
    const rows = (
      options.nodeId
        ? this.database.db
            .prepare('SELECT * FROM events WHERE node_id = ? ORDER BY id DESC LIMIT ?')
            .all(options.nodeId, options.limit)
        : this.database.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(options.limit)
    ) as Array<{ id: number; at: number; kind: EventKind; node_id: string | null; actor: string; detail_json: string | null }>;
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

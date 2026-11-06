import type { CommandStatus, TelemetryValue } from './messages';

/**
 * Shapes returned by the core's REST API and pushed through its WebSocket.
 * Declared once here so the core and the clients cannot drift apart.
 */

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

export interface TelemetrySample {
  receivedAt: number;
  seq: number;
  values: Record<string, TelemetryValue>;
}

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

/** active: not acknowledged; acknowledged: still active; cleared: normal again but not acknowledged; closed: both. */
export type AlarmState = 'active' | 'acknowledged' | 'cleared' | 'closed';

/**
 * An alarm is a state of one point (node + alarm), not one message per event: while it is
 * not acknowledged, new activations reuse the same record and increase `count`.
 */
export interface AlarmRecord {
  id: number;
  nodeId: string;
  key: string;
  state: AlarmState;
  raisedAt: number;
  /** Activations of this record (1 the first time). */
  count: number;
  lastRaisedAt: number;
  raisedValue: number | null;
  detail: string | null;
  ackedAt: number | null;
  ackedBy: string | null;
  clearedAt: number | null;
  clearedValue: number | null;
}

/** Audit log entry (GET /api/events): who did what, when (RF-06). */
export interface AuditEvent {
  id: number;
  at: number;
  /** "category.action", e.g. "command.sent", "user.login". */
  kind: string;
  nodeId: string | null;
  /** Username, or "system" for automatic events. */
  actor: string;
  detail: Record<string, unknown> | null;
}

export type AuditCategory = 'node' | 'command' | 'alarm' | 'user' | 'system';

/** Data to program into a node so it can reach the platform (GET /api/system/node-access). */
export type NodeAccess =
  | { configured: false }
  | {
      configured: true;
      /** IPv4 addresses of the platform computer on the local network. */
      hosts: string[];
      port: number;
      topicPrefix: string;
      username: string;
      password: string;
    };

/** Messages of the real-time channel (WebSocket /api/ws). */
export type RealtimeEvent =
  | { event: 'auth'; data: { username: string; roleId: string } }
  | { event: 'node'; data: NodeInfo }
  | { event: 'telemetry'; data: { nodeId: string; sample: TelemetrySample } }
  | { event: 'command'; data: CommandRecord }
  | { event: 'alarm'; data: AlarmRecord };

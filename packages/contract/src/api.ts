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

export interface AlarmRecord {
  id: number;
  nodeId: string;
  key: string;
  state: AlarmState;
  raisedAt: number;
  raisedValue: number | null;
  detail: string | null;
  ackedAt: number | null;
  ackedBy: string | null;
  clearedAt: number | null;
  clearedValue: number | null;
}

/** Messages of the real-time channel (WebSocket /api/ws). */
export type RealtimeEvent =
  | { event: 'auth'; data: { username: string; roleId: string } }
  | { event: 'node'; data: NodeInfo }
  | { event: 'telemetry'; data: { nodeId: string; sample: TelemetrySample } }
  | { event: 'command'; data: CommandRecord }
  | { event: 'alarm'; data: AlarmRecord };

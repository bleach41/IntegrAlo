import { z } from 'zod';

/**
 * MQTT message payloads (JSON).
 * TypeScript types disappear at runtime, so every message that arrives from the
 * network is validated with these schemas before the core uses it.
 */

export const TelemetryValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export type TelemetryValue = z.infer<typeof TelemetryValueSchema>;

/** Node -> platform, retained. Sent on every (re)connection. */
export const AnnounceMessageSchema = z.object({
  nodeId: z.string(),
  module: z.string(),
  fw: z.string(),
  uptimeMs: z.number().int().nonnegative(),
});
export type AnnounceMessage = z.infer<typeof AnnounceMessageSchema>;

/** Node -> platform, retained. "offline" is published by the broker as the node's Last Will. */
export const NodeStatusSchema = z.enum(['online', 'offline']);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

/**
 * Node -> platform, periodic.
 * The node has no reliable clock without Internet: it sends a sequence number and its
 * uptime; the platform timestamps the message on reception. Gaps in seq reveal lost messages.
 */
export const TelemetryMessageSchema = z.object({
  seq: z.number().int().nonnegative(),
  uptimeMs: z.number().int().nonnegative(),
  values: z.record(TelemetryValueSchema),
});
export type TelemetryMessage = z.infer<typeof TelemetryMessageSchema>;

/** Platform -> node. The payload is validated by the module, which knows its commands. */
export const CommandMessageSchema = z.object({
  cmdId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
});
export type CommandMessage = z.infer<typeof CommandMessageSchema>;

/**
 * Node -> platform, one per command.
 * QoS 1 may deliver a command twice: the node remembers recent cmdIds and answers a
 * duplicate with the same ack instead of applying it again.
 */
export const AckMessageSchema = z.discriminatedUnion('result', [
  z.object({
    cmdId: z.string().min(1),
    result: z.literal('accepted'),
    state: z.record(TelemetryValueSchema),
  }),
  z.object({
    cmdId: z.string().min(1),
    result: z.literal('rejected'),
    reason: z.string().min(1),
  }),
]);
export type AckMessage = z.infer<typeof AckMessageSchema>;

/** Lifecycle of a command inside the platform. A command never stays undefined. */
export type CommandStatus = 'sent' | 'confirmed' | 'rejected' | 'unconfirmed';

/** Proposed timing defaults; adjustable before the tests (see section 6). */
export const PROTOCOL_DEFAULTS = {
  keepaliveSeconds: 10,
  ackTimeoutMs: 5000,
  missedTelemetryPeriods: 3,
} as const;

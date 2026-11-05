/**
 * MQTT topic layout: {prefix}/nodes/{nodeId}/{kind}
 * Example: integralo/nodes/esp32-a1b2c3/telemetry
 */

export const DEFAULT_TOPIC_PREFIX = 'integralo';

export const NODE_TOPIC_KINDS = ['announce', 'status', 'telemetry', 'cmd', 'ack'] as const;
export type NodeTopicKind = (typeof NODE_TOPIC_KINDS)[number];

/** Delivery guarantees per topic kind (see REQUISITOS_Y_CONTRATO.md, section 6). */
export const TOPIC_QOS: Record<NodeTopicKind, 0 | 1> = {
  announce: 1,
  status: 1,
  telemetry: 0, // a lost reading is replaced by the next one
  cmd: 1, // a command must not be lost
  ack: 1,
};

/** Retained messages let the core learn every node's identity and status right after it starts. */
export const TOPIC_RETAINED: Record<NodeTopicKind, boolean> = {
  announce: true,
  status: true,
  telemetry: false,
  cmd: false, // an old command must never be applied on reconnection
  ack: false,
};

const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function isValidNodeId(nodeId: string): boolean {
  return NODE_ID_PATTERN.test(nodeId);
}

export function nodeTopic(nodeId: string, kind: NodeTopicKind, prefix = DEFAULT_TOPIC_PREFIX): string {
  if (!isValidNodeId(nodeId)) {
    throw new Error(`Invalid nodeId: "${nodeId}"`);
  }
  return `${prefix}/nodes/${nodeId}/${kind}`;
}

/** Subscription filter for everything the nodes publish, e.g. "integralo/nodes/+/telemetry". */
export function nodeTopicFilter(kind: NodeTopicKind, prefix = DEFAULT_TOPIC_PREFIX): string {
  return `${prefix}/nodes/+/${kind}`;
}

export interface ParsedNodeTopic {
  nodeId: string;
  kind: NodeTopicKind;
}

/** Returns null when the topic does not belong to the platform or is malformed. */
export function parseNodeTopic(topic: string, prefix = DEFAULT_TOPIC_PREFIX): ParsedNodeTopic | null {
  const parts = topic.split('/');
  if (parts.length !== 4 || parts[0] !== prefix || parts[1] !== 'nodes') {
    return null;
  }
  const [, , nodeId, kind] = parts;
  if (!isValidNodeId(nodeId) || !(NODE_TOPIC_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  return { nodeId, kind: kind as NodeTopicKind };
}

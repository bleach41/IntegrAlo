/**
 * Permissions are plain strings assigned to roles in the database (RF-08):
 * - general actions: "nodes.read", "nodes.approve", "users.manage", ...
 * - module commands: "command:<module>:<type>", e.g. "command:temperature:set_setpoint"
 * A granted permission may use "*" as a wildcard segment; "*" alone grants everything.
 */
export const PERMISSIONS = {
  nodesRead: 'nodes.read',
  nodesApprove: 'nodes.approve',
  telemetryRead: 'telemetry.read',
  commandsRead: 'commands.read',
  modulesRead: 'modules.read',
  eventsRead: 'events.read',
  alarmsRead: 'alarms.read',
  alarmsAck: 'alarms.ack',
  alarmsConfigure: 'alarms.configure',
  usersManage: 'users.manage',
} as const;

export function commandPermission(module: string, type: string): string {
  return `command:${module}:${type}`;
}

export function grants(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = granted.split(':');
  const r = required.split(':');
  return g.length === r.length && g.every((segment, i) => segment === '*' || segment === r[i]);
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.some((g) => grants(g, required));
}

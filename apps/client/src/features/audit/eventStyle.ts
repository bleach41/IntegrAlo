import {
  Archive,
  BadgeCheck,
  Ban,
  BellOff,
  BellRing,
  CheckCheck,
  CircleDot,
  CircleHelp,
  Clock,
  Eye,
  Flag,
  LogIn,
  LogOut,
  type LucideIcon,
  Pencil,
  Radar,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
  UserCog,
  UserPen,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react-native';

/**
 * What an event means for the operator, which decides its colour (as in ISA-101 displays, colour
 * is kept for the condition, not for the kind of thing): it went well, it failed, it needs
 * attention, or it is only a record of what someone did.
 */
export type EventSeverity = 'ok' | 'failure' | 'attention' | 'info';

/** Icon and severity of each audit event; the icon tells the event apart within its colour. */
const STYLES: Record<string, { icon: LucideIcon; severity: EventSeverity }> = {
  'node.discovered': { icon: Radar, severity: 'attention' }, // waits for someone to approve it
  'node.approved': { icon: ShieldCheck, severity: 'ok' },
  'node.online': { icon: Wifi, severity: 'ok' },
  'node.offline': { icon: WifiOff, severity: 'failure' },
  'node.renamed': { icon: Pencil, severity: 'info' },
  'node.retired': { icon: Archive, severity: 'info' },
  'node.revoked': { icon: Unplug, severity: 'info' },
  'command.sent': { icon: Send, severity: 'info' },
  'command.confirmed': { icon: CheckCheck, severity: 'ok' },
  'command.rejected': { icon: Ban, severity: 'failure' },
  'command.unconfirmed': { icon: CircleHelp, severity: 'attention' },
  'command.late_ack': { icon: Clock, severity: 'attention' },
  'alarm.raised': { icon: BellRing, severity: 'attention' },
  'alarm.acknowledged': { icon: BadgeCheck, severity: 'ok' },
  'alarm.cleared': { icon: BellOff, severity: 'ok' },
  'alarm.configured': { icon: SlidersHorizontal, severity: 'info' },
  'user.login': { icon: LogIn, severity: 'info' },
  'user.login_failed': { icon: ShieldAlert, severity: 'failure' },
  'user.logout': { icon: LogOut, severity: 'info' },
  'user.created': { icon: UserPlus, severity: 'info' },
  'user.updated': { icon: UserPen, severity: 'info' },
  'role.updated': { icon: UserCog, severity: 'info' },
  'setup.completed': { icon: Flag, severity: 'ok' },
  'system.node_access_viewed': { icon: Eye, severity: 'info' },
};

/** Unknown kinds (a newer server) still get a neutral mark. */
export function eventStyle(kind: string): { icon: LucideIcon; severity: EventSeverity } {
  return STYLES[kind] ?? { icon: CircleDot, severity: 'info' };
}

/** Theme token of each severity (circle tint and icon colour). */
export const SEVERITY_TOKEN: Record<EventSeverity, 'accent' | 'danger' | 'warning' | 'muted'> = {
  ok: 'accent',
  failure: 'danger',
  attention: 'warning',
  info: 'muted',
};

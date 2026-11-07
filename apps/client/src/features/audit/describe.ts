import { localize, type AuditEvent, type ModuleManifest } from '@integralo/contract';
import type { TFunction } from 'i18next';

interface Context {
  t: TFunction;
  lang: string;
  /** Module of the event's node, for the names of its commands, fields, alarms and units. */
  manifest?: ModuleManifest;
}

/**
 * Short human summary of an audit event's detail, in the reader's language: names come from the
 * module manifest ("Consigna: 22 °C", "Arranque de la bomba 80 % · Parada de la bomba 50 %") and
 * the node's reason codes are translated. Internal ids are left out. Anything the manifest does
 * not describe (an older event, a newer server) is shown as it is rather than hidden.
 */
export function describeEvent(event: AuditEvent, { t, lang, manifest }: Context): string {
  const d = event.detail ?? {};
  const num = (v: number) => v.toLocaleString(lang, { maximumFractionDigits: 2 });
  const plain = (v: unknown) => (typeof v === 'number' ? num(v) : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const alarmName = (key: unknown) => {
    if (typeof key !== 'string') return '';
    if (key === 'commLoss') return t('alarms.commLoss');
    return localize(manifest?.alarms.find((a) => a.key === key)?.label, lang, key);
  };
  const reason = (code: unknown) => {
    if (typeof code !== 'string') return '';
    const k = `commands.reasons.${code}`;
    return t('audit.details.rejected', { reason: i18nExists(t, k) ? t(k as 'commands.reasons.out_of_range') : code });
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');

  switch (event.kind) {
    case 'command.sent':
      return command(d.type, d.payload, { lang, manifest, num, plain });
    case 'command.confirmed':
      return typeof d.latencyMs === 'number' ? t('audit.details.latency', { ms: num(d.latencyMs) }) : '';
    case 'command.rejected':
      return reason(d.reason);
    case 'command.unconfirmed':
      return typeof d.timeoutMs === 'number' ? t('audit.details.noAnswer', { s: num(d.timeoutMs / 1000) }) : '';
    case 'command.late_ack':
      return d.result === 'confirmed' ? t('audit.details.lateConfirmed') : d.result === 'rejected' ? t('audit.details.lateRejected') : '';
    case 'alarm.raised': {
      const def = manifest?.alarms.find((a) => a.key === d.key);
      const unit = unitOf(manifest, def?.variable);
      const value = typeof d.value === 'number' ? t('alarms.value', { value: `${num(d.value)}${unit ? ` ${unit}` : ''}` }) : '';
      return join(alarmName(d.key), value);
    }
    case 'alarm.acknowledged':
    case 'alarm.cleared':
      return alarmName(d.key);
    case 'alarm.configured': {
      const def = manifest?.alarms.find((a) => a.key === d.key);
      const unit = unitOf(manifest, def?.variable);
      const withUnit = (v: unknown) => (typeof v === 'number' ? `${num(v)}${unit ? ` ${unit}` : ''}` : plain(v));
      return join(
        alarmName(d.key),
        d.threshold !== undefined ? t('audit.details.threshold', { value: withUnit(d.threshold) }) : '',
        d.deadband !== undefined ? t('audit.details.deadband', { value: withUnit(d.deadband) }) : '',
        d.delayS !== undefined ? t('audit.details.delay', { s: plain(d.delayS) }) : '',
        d.enabled === true ? t('audit.details.enabled') : d.enabled === false ? t('audit.details.disabled') : '',
      );
    }
    case 'user.created':
      return join(plain(d.username ?? ''), role(t, d.roleId));
    case 'user.updated':
      return join(
        plain(d.username ?? ''),
        role(t, d.roleId),
        d.disabled === true ? t('audit.details.userDisabled') : d.disabled === false ? t('audit.details.userEnabled') : '',
        d.passwordChanged === true ? t('audit.details.passwordChanged') : '',
      );
    case 'user.login_failed':
      return typeof d.attempt === 'number' ? t('audit.details.attempt', { n: d.attempt }) : '';
    default:
      return '';
  }
}

/** "Consigna: 22 °C"; several fields: "Arranque de la bomba 80 % · Parada de la bomba 50 %". */
function command(
  type: unknown,
  payload: unknown,
  { lang, manifest, num, plain }: { lang: string; manifest?: ModuleManifest; num: (v: number) => string; plain: (v: unknown) => string },
): string {
  const def = manifest?.commands.find((c) => c.type === type);
  const title = localize(def?.label, lang, typeof type === 'string' ? type : '');
  if (!payload || typeof payload !== 'object') return title;
  const entries = Object.entries(payload as Record<string, unknown>);
  const value = (name: string, v: unknown) => {
    const field = def?.fields[name];
    if (field?.type === 'enum' && typeof v === 'string') return localize(field.valueLabels?.[v], lang, v);
    if (typeof v === 'number') return `${num(v)}${field?.type === 'number' && field.unit ? ` ${field.unit}` : ''}`;
    return plain(v);
  };
  // A single field is named by the command itself ("Consigna: 22 °C").
  if (entries.length === 1 && Object.keys(def?.fields ?? {}).length === 1) return `${title}: ${value(entries[0][0], entries[0][1])}`;
  return entries.map(([name, v]) => `${localize(def?.fields[name]?.label, lang, name)} ${value(name, v)}`).join(' · ');
}

/** Unit of a numeric variable (enum and boolean variables have none). */
function unitOf(manifest: ModuleManifest | undefined, key: string | undefined): string | undefined {
  const v = manifest?.variables.find((x) => x.key === key);
  return v?.type === 'number' ? v.unit : undefined;
}

function role(t: TFunction, roleId: unknown): string {
  if (typeof roleId !== 'string') return '';
  const k = `roles.${roleId}`;
  return t('audit.details.role', { role: i18nExists(t, k) ? t(k as 'roles.user') : roleId });
}

/** A key exists when translating it does not give the key back. */
function i18nExists(t: TFunction, key: string): boolean {
  return t(key as 'roles.user') !== key;
}

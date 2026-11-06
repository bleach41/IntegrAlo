import { localize, type AuditCategory, type AuditEvent } from '@integralo/contract';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuditLog, useModules, useNodes } from '@/api/queries';
import { TopBar } from '@/components/TopBar';
import { Card, Screen, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORIES: AuditCategory[] = ['node', 'command', 'alarm', 'user', 'system'];

/** Audit log (RF-06), engineering only: newest first, filtered by category, paged backwards. */
export default function AuditScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [category, setCategory] = useState<AuditCategory | undefined>();
  const log = useAuditLog(category);
  const events = log.data?.pages.flat() ?? [];

  return (
    <Screen
      wide
      inTabs
      header={<TopBar title={t('audit.title')} subtitle={t('audit.subtitle')} />}
      sticky={
        // The filters stay at the top while the list scrolls.
        <View className="mb-2 flex-row flex-wrap">
          <Chip label={t('audit.all')} selected={!category} onPress={() => setCategory(undefined)} />
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`audit.categories.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
      }
    >
      <Card>
        {log.isPending ? <ActivityIndicator color={colors.accent} /> : null}
        {log.isSuccess && events.length === 0 ? <Text className="text-sm text-muted">{t('audit.empty')}</Text> : null}
        {events.map((event, i) => (
          <EventRow key={event.id} event={event} first={i === 0} />
        ))}
        {log.hasNextPage ? (
          <View className="mt-3 items-center">
            <SmallButton label={t('audit.loadMore')} busy={log.isFetchingNextPage} onPress={() => void log.fetchNextPage()} />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${selected ? 'border-accent bg-accent/15' : 'border-line active:bg-line'}`}
    >
      <Text className={`text-xs font-medium ${selected ? 'text-accent' : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}

function EventRow({ event, first }: { event: AuditEvent; first: boolean }) {
  const { t, i18n } = useTranslation();
  const node = useNodes().data?.find((n) => n.id === event.nodeId);
  const kindKey = `audit.kinds.${event.kind}`;
  const title = i18n.exists(kindKey) ? t(kindKey as 'audit.title') : event.kind;
  const when = new Date(event.at).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'medium' });
  const actor = event.actor === 'system' ? t('audit.system') : event.actor;
  const tone = event.kind.endsWith('failed') || event.kind.endsWith('rejected') || event.kind === 'alarm.raised' ? 'text-warning' : 'text-ink';
  const manifest = useModules().data?.find((m) => m.id === node?.module);
  const alarmName = (key: string) =>
    key === 'commLoss' ? t('alarms.commLoss') : localize(manifest?.alarms.find((a) => a.key === key)?.label, i18n.language, key);
  const detail = describe(event, alarmName);

  return (
    <View className={`py-2.5 ${first ? '' : 'border-t border-line'}`}>
      <View className="flex-row items-baseline justify-between">
        <Text className={`flex-1 pr-3 text-sm font-medium ${tone}`}>{title}</Text>
        <Text className="text-xs text-muted">{when}</Text>
      </View>
      <Text className="mt-0.5 text-xs text-muted">
        {actor}
        {event.nodeId ? ` · ${node?.name ?? event.nodeId}` : ''}
        {detail ? ` · ${detail}` : ''}
      </Text>
    </View>
  );
}

/** Short human summary of the event detail; internal ids are left out. */
function describe(event: AuditEvent, alarmName: (key: string) => string): string {
  const d = event.detail ?? {};
  const pick = (...keys: string[]) =>
    keys
      .filter((k) => d[k] !== undefined && d[k] !== null)
      .map((k) => (typeof d[k] === 'object' ? JSON.stringify(d[k]) : String(d[k])))
      .join(' ');
  switch (event.kind) {
    case 'command.sent':
      return pick('type', 'payload');
    case 'command.confirmed':
      return d.latencyMs !== undefined ? `${d.latencyMs} ms` : '';
    case 'command.rejected':
      return pick('reason');
    case 'alarm.raised':
      return [typeof d.key === 'string' ? alarmName(d.key) : '', pick('value')].filter(Boolean).join(' ');
    case 'alarm.configured':
      return [
        typeof d.key === 'string' ? alarmName(d.key) : '',
        JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'key'))),
      ]
        .filter(Boolean)
        .join(' ');
    case 'node.approved':
      // The approved name is already shown as the node's name.
      return '';
    case 'user.created':
    case 'user.updated':
      return pick('username', 'roleId');
    case 'user.login_failed':
      return d.attempt !== undefined ? `#${d.attempt}` : '';
    default:
      return '';
  }
}

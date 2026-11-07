import { localize, type AuditCategory, type AuditEvent } from '@integralo/contract';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { localDay, nextLocalDay, previousLocalDay, useAuditLog, useModules, useNodes } from '@/api/queries';
import { TopBar } from '@/components/TopBar';
import { Card, Screen, SmallButton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

const CATEGORIES: AuditCategory[] = ['node', 'command', 'alarm', 'user', 'system'];

/**
 * Audit log (RF-06), engineering only: newest first, filtered by category and by day (today by
 * default, or the whole history), paged backwards.
 */
export default function AuditScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [category, setCategory] = useState<AuditCategory | undefined>();
  // Local midnight of the day shown; undefined = whole history.
  const [day, setDay] = useState<number | undefined>(() => localDay(Date.now()));
  const log = useAuditLog(category, day);
  const events = log.data?.pages.flat() ?? [];

  return (
    <Screen
      wide
      inTabs
      header={<TopBar title={t('audit.title')} subtitle={t('audit.subtitle')} />}
      sticky={
        // The filters stay at the top while the list scrolls: the day across the width, then the
        // categories in a single row that slides sideways when it does not fit.
        <View className="mb-2">
          <DayPicker day={day} onChange={setDay} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1" contentContainerClassName="px-1">
            <Chip label={t('audit.all')} selected={!category} onPress={() => setCategory(undefined)} />
            {CATEGORIES.map((c) => (
              <Chip key={c} label={t(`audit.categories.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
        </View>
      }
    >
      <Card>
        {log.isPending ? <ActivityIndicator color={colors.accent} /> : null}
        {log.isSuccess && events.length === 0 ? <Text className="text-sm text-muted">{t(day === undefined ? 'audit.empty' : 'audit.emptyDay')}</Text> : null}
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

/** «‹ Today ›» to go back and forth day by day, plus «Whole history». */
function DayPicker({ day, onChange }: { day: number | undefined; onChange: (day: number | undefined) => void }) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const today = localDay(Date.now());
  const shown = day ?? today;
  const canGoForward = day !== undefined && day < today;
  const label =
    day === undefined
      ? t('audit.chooseDay')
      : day === today
        ? t('audit.today')
        : day === previousLocalDay(today)
          ? t('audit.yesterday')
          : new Date(day).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <View className="mb-3 w-full flex-row items-center">
      <View className={`mr-2 flex-1 flex-row items-center justify-between rounded-full border ${day === undefined ? 'border-line' : 'border-accent bg-accent/15'}`}>
        <Pressable
          onPress={() => onChange(day === undefined ? today : previousLocalDay(shown))}
          accessibilityRole="button"
          accessibilityLabel={t('audit.previousDay')}
          hitSlop={6}
          className="rounded-full px-2 py-1.5 active:bg-line"
        >
          <ChevronLeft size={16} color={day === undefined ? colors.muted : colors.accent} />
        </Pressable>
        <Pressable onPress={() => onChange(shown)} accessibilityRole="button" className="py-1.5">
          <Text className={`min-w-24 text-center text-xs font-medium ${day === undefined ? 'text-muted' : 'text-accent'}`}>{label}</Text>
        </Pressable>
        <Pressable
          onPress={canGoForward ? () => onChange(nextLocalDay(shown)) : undefined}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel={t('audit.nextDay')}
          accessibilityState={{ disabled: !canGoForward }}
          hitSlop={6}
          className={`rounded-full px-2 py-1.5 active:bg-line ${canGoForward ? '' : 'opacity-30'}`}
        >
          <ChevronRight size={16} color={day === undefined ? colors.muted : colors.accent} />
        </Pressable>
      </View>
      <Chip label={t('audit.wholeHistory')} selected={day === undefined} onPress={() => onChange(undefined)} inline />
    </View>
  );
}

function Chip({ label, selected, onPress, inline }: { label: string; selected: boolean; onPress: () => void; inline?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`${inline ? '' : 'mr-2'} rounded-full border px-3 py-1.5 ${selected ? 'border-accent bg-accent/15' : 'border-line active:bg-line'}`}
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

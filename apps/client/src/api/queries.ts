import type {
  AlarmRecord,
  AuditCategory,
  AuditEvent,
  CommandRecord,
  ModuleManifest,
  NodeAccess,
  NodeInfo,
  TelemetrySample,
} from '@integralo/contract';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSession } from '@/features/auth/session.store';
import { ApiError, apiRequest } from './client';

/** Cache keys, in one place so the real-time channel updates the same entries. */
export const queryKeys = {
  nodes: ['nodes'] as const,
  modules: ['modules'] as const,
  latest: (nodeId: string) => ['telemetry', 'latest', nodeId] as const,
  history: (nodeId: string) => ['telemetry', 'history', nodeId] as const,
  command: (commandId: string) => ['command', commandId] as const,
  openAlarms: ['alarms', 'open'] as const,
};

/** Time window of the trend chart. */
export const HISTORY_WINDOW_MS = 3_600_000;

/** Authenticated request bound to the current session; a 401 ends the session. */
export function useApi() {
  const serverUrl = useSession((s) => s.serverUrl);
  const token = useSession((s) => s.token);
  const logout = useSession((s) => s.logout);

  return useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      if (!serverUrl) throw new ApiError(0, 'no server');
      try {
        return await apiRequest<T>(serverUrl, method, path, { body, token });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) void logout();
        throw err;
      }
    },
    [serverUrl, token, logout],
  );
}

export function useNodes() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.nodes, queryFn: () => api<NodeInfo[]>('GET', '/nodes') });
}

/** Module manifests: the interface is built from them (variables, labels, units). */
export function useModules() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.modules,
    queryFn: () => api<ModuleManifest[]>('GET', '/modules'),
    staleTime: Infinity,
  });
}

/** Last reading of a node; null while the node has not sent any. Kept fresh by the WebSocket. */
export function useLatestTelemetry(nodeId: string, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.latest(nodeId),
    enabled,
    queryFn: async () => {
      try {
        return await api<TelemetrySample>('GET', `/nodes/${nodeId}/telemetry/latest`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useOpenAlarms() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.openAlarms, queryFn: () => api<AlarmRecord[]>('GET', '/alarms') });
}

/** Points of a reduced chart series: about two per pixel of a wide chart. */
export const CHART_POINTS = 600;

/**
 * Readings of the last `windowMs`. The last hour comes reading by reading and the WebSocket
 * appends new samples to it; longer windows come averaged by the core into CHART_POINTS
 * samples and are refreshed every minute.
 */
export function useHistory(nodeId: string, windowMs: number = HISTORY_WINDOW_MS) {
  const api = useApi();
  const live = windowMs <= HISTORY_WINDOW_MS;
  return useQuery({
    queryKey: live ? queryKeys.history(nodeId) : ([...queryKeys.history(nodeId), windowMs] as const),
    queryFn: () =>
      api<TelemetrySample[]>(
        'GET',
        `/nodes/${nodeId}/telemetry?from=${Date.now() - windowMs}` + (live ? '&limit=5000' : `&points=${CHART_POINTS}`),
      ),
    refetchInterval: live ? false : 60_000,
    // Changing the window keeps the previous chart on screen until the new one arrives.
    placeholderData: (previous) => previous,
  });
}

export function useSendCommand(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: { type: string; payload: Record<string, unknown> }) =>
      api<CommandRecord>('POST', `/nodes/${nodeId}/commands`, command),
    // The ack may arrive through the WebSocket before this response: keep the newer state.
    onSuccess: (record) =>
      queryClient.setQueryData<CommandRecord>(queryKeys.command(record.id), (current) => current ?? record),
  });
}

/** State of a sent command, updated live (sent → confirmed / rejected / unconfirmed). */
export function useCommand(commandId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.command(commandId ?? ''),
    enabled: !!commandId,
    queryFn: () => api<CommandRecord>('GET', `/commands/${commandId}`),
    staleTime: Infinity,
  });
}

export function useAcknowledgeAlarm() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alarmId: number) => api<AlarmRecord>('POST', `/alarms/${alarmId}/ack`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.openAlarms }),
  });
}

/** Per-node alarm thresholds (high/low lines of the synoptic bars). */
export interface AlarmConfig {
  key: string;
  variable: string;
  type: 'high' | 'low';
  threshold: number;
  deadband: number;
  delayS: number;
  enabled: boolean;
}

export function useAlarmConfigs(nodeId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['alarm-configs', nodeId],
    queryFn: () => api<AlarmConfig[]>('GET', `/nodes/${nodeId}/alarm-configs`),
  });
}

export function useSaveAlarmConfig(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, changes }: { key: string; changes: Partial<Pick<AlarmConfig, 'threshold' | 'deadband' | 'delayS' | 'enabled'>> }) =>
      api<AlarmConfig>('PUT', `/nodes/${nodeId}/alarm-configs/${key}`, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarm-configs', nodeId] }),
  });
}

export interface UserInfo {
  id: number;
  username: string;
  roleId: string;
  disabled: boolean;
  createdAt: number;
}

export function useUsers(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: ['users'], enabled, queryFn: () => api<UserInfo[]>('GET', '/users') });
}

export function useRoles(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ['roles'],
    enabled,
    queryFn: () => api<Array<{ id: string; name: string; permissions: string[] }>>('GET', '/roles'),
  });
}

export function useCreateUser() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string; roleId: string }) => api<UserInfo>('POST', '/users', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: { roleId?: string; disabled?: boolean; password?: string } }) =>
      api<UserInfo>('PATCH', `/users/${id}`, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

const AUDIT_PAGE = 50;

/**
 * Audit log, newest first, loaded in pages of 50 going backwards. `day` (local midnight, epoch ms)
 * limits it to that day; without it the whole history is listed.
 */
export function useAuditLog(category: AuditCategory | undefined, day?: number) {
  const api = useApi();
  const end = day === undefined ? undefined : nextLocalDay(day);
  return useInfiniteQuery({
    queryKey: ['audit', category ?? 'all', day ?? 'all'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => {
      // Built by hand: URLSearchParams on phones (React Native) does not implement set().
      const params = [`limit=${AUDIT_PAGE}`];
      if (category) params.push(`category=${encodeURIComponent(category)}`);
      if (day !== undefined && end !== undefined) params.push(`from=${day}`, `to=${end}`);
      if (pageParam !== undefined) params.push(`beforeId=${pageParam}`);
      return api<AuditEvent[]>('GET', `/events?${params.join('&')}`);
    },
    getNextPageParam: (page) => (page.length === AUDIT_PAGE ? page[page.length - 1].id : undefined),
    // A past day no longer changes; only the whole history and today get new events.
    refetchInterval: end === undefined || end > Date.now() ? 15_000 : false,
  });
}

/** Local midnight of the day containing `at`. */
export function localDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of the following day (a day is not always 24 h: daylight saving). */
export function nextLocalDay(day: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Local midnight of the previous day. */
export function previousLocalDay(day: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Fetched on demand only (each read is audited by the core). */
export function useNodeAccess() {
  const api = useApi();
  return useMutation({ mutationFn: () => api<NodeAccess>('GET', '/system/node-access') });
}

export function useApproveNode() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, name }: { nodeId: string; name?: string }) =>
      api<NodeInfo>('POST', `/nodes/${nodeId}/approve`, name ? { name } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.nodes }),
  });
}

export function useRenameNode(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<NodeInfo>('PATCH', `/nodes/${nodeId}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.nodes }),
  });
}

/** Takes an offline node out of the list; its history is kept and it returns as pending if it reconnects. */
export function useRetireNode(nodeId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('POST', `/nodes/${nodeId}/retire`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nodes });
      queryClient.invalidateQueries({ queryKey: queryKeys.openAlarms });
    },
  });
}

import type { AlarmRecord, CommandRecord, ModuleManifest, NodeInfo, TelemetrySample } from '@integralo/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Last hour of readings; the WebSocket appends new samples to the same cache entry. */
export function useHistory(nodeId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.history(nodeId),
    queryFn: () => api<TelemetrySample[]>('GET', `/nodes/${nodeId}/telemetry?from=${Date.now() - HISTORY_WINDOW_MS}&limit=5000`),
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

export function useApproveNode() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, name }: { nodeId: string; name?: string }) =>
      api<NodeInfo>('POST', `/nodes/${nodeId}/approve`, name ? { name } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.nodes }),
  });
}

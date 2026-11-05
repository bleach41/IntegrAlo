import type { AlarmRecord, ModuleManifest, NodeInfo, TelemetrySample } from '@integralo/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSession } from '@/features/auth/session.store';
import { ApiError, apiRequest } from './client';

/** Cache keys, in one place so the real-time channel updates the same entries. */
export const queryKeys = {
  nodes: ['nodes'] as const,
  modules: ['modules'] as const,
  latest: (nodeId: string) => ['telemetry', 'latest', nodeId] as const,
  openAlarms: ['alarms', 'open'] as const,
};

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

export function useApproveNode() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nodeId, name }: { nodeId: string; name?: string }) =>
      api<NodeInfo>('POST', `/nodes/${nodeId}/approve`, name ? { name } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.nodes }),
  });
}

import type { AlarmRecord, NodeInfo, RealtimeEvent, TelemetrySample } from '@integralo/contract';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSession } from '@/features/auth/session.store';
import { relocatePairedServer, serverReachable } from '@/features/pairing/relocate';
import { HISTORY_WINDOW_MS, queryKeys } from './queries';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

export const useRealtimeStatus = create<{ status: RealtimeStatus; set(status: RealtimeStatus): void }>((set) => ({
  status: 'connecting',
  set: (status) => set({ status }),
}));

const MAX_RETRY_MS = 30_000;
/** Close code the core uses when the session is not valid. */
const CLOSE_UNAUTHORIZED = 4001;
/** Failed attempts in a row (about 7 s offline) before looking for the server at another address. */
const RELOCATE_AFTER_ATTEMPTS = 3;

/**
 * Keeps one WebSocket to the core while signed in and writes every pushed change into
 * the query cache, so screens update without polling. Reconnects with exponential
 * backoff (1 s, 2 s, 4 s… up to 30 s) and resynchronises everything after reconnecting,
 * since changes made while disconnected were not received. If the server stays unreachable,
 * the paired server is looked for at another address (its IP may have changed).
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const serverUrl = useSession((s) => s.serverUrl);
  const token = useSession((s) => s.token);
  const setStatus = useRealtimeStatus((s) => s.set);

  useEffect(() => {
    if (!serverUrl || !token) return;
    let socket: WebSocket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const handle = (message: RealtimeEvent) => {
      switch (message.event) {
        case 'auth':
          attempt = 0;
          serverReachable();
          setStatus('live');
          void queryClient.invalidateQueries();
          break;
        case 'node':
          queryClient.setQueryData<NodeInfo[]>(queryKeys.nodes, (nodes) => upsert(nodes, message.data, (n) => n.id));
          break;
        case 'telemetry': {
          const { nodeId, sample } = message.data;
          queryClient.setQueryData(queryKeys.latest(nodeId), sample);
          // Extend the trend only if it is loaded, dropping samples older than the window.
          queryClient.setQueryData<TelemetrySample[]>(queryKeys.history(nodeId), (history) => {
            if (!history) return history;
            const from = sample.receivedAt - HISTORY_WINDOW_MS;
            return [...history.filter((s) => s.receivedAt >= from), sample];
          });
          break;
        }
        case 'alarm':
          queryClient.setQueryData<AlarmRecord[]>(queryKeys.openAlarms, (alarms) =>
            message.data.state === 'closed'
              ? alarms?.filter((a) => a.id !== message.data.id)
              : upsert(alarms, message.data, (a) => a.id),
          );
          break;
        case 'command':
          queryClient.setQueryData(queryKeys.command(message.data.id), message.data);
          break;
      }
    };

    const connect = () => {
      setStatus('connecting');
      socket = new WebSocket(`${serverUrl.replace(/^http/, 'ws')}/api/ws`);
      // The token travels in the first message, not in the URL.
      socket.onopen = () => socket?.send(JSON.stringify({ event: 'auth', data: { token } }));
      socket.onmessage = (e) => {
        try {
          handle(JSON.parse(String(e.data)) as RealtimeEvent);
        } catch {
          // Ignore malformed messages.
        }
      };
      socket.onclose = (e) => {
        setStatus('offline');
        if (stopped) return;
        if (e.code === CLOSE_UNAUTHORIZED) {
          void useSession.getState().logout();
          return;
        }
        retryTimer = setTimeout(connect, Math.min(MAX_RETRY_MS, 1000 * 2 ** attempt++));
        // Found elsewhere, the session store gets the new address and this effect restarts there.
        if (attempt >= RELOCATE_AFTER_ATTEMPTS) void relocatePairedServer();
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [serverUrl, token, queryClient, setStatus]);
}

function upsert<T>(items: T[] | undefined, item: T, id: (x: T) => string | number): T[] | undefined {
  if (!items) return items; // not loaded yet: the first query will bring it
  const index = items.findIndex((x) => id(x) === id(item));
  if (index === -1) return [...items, item];
  const next = items.slice();
  next[index] = item;
  return next;
}

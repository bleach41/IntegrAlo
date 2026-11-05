import { create } from 'zustand';
import { ApiError, apiRequest, normalizeServerUrl } from '@/api/client';
import { storage } from '@/lib/storage';

export interface SessionUser {
  id: number;
  username: string;
  roleId: string;
  permissions: string[];
}

interface SessionState {
  /** "loading" until the saved server and token have been read and checked. */
  status: 'loading' | 'ready';
  serverUrl: string | null;
  token: string | null;
  user: SessionUser | null;
  needsSetup: boolean;
  hydrate(): Promise<void>;
  connect(address: string): Promise<void>;
  forgetServer(): Promise<void>;
  setup(username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SERVER_KEY = 'integralo.server';
const TOKEN_KEY = 'integralo.token';

/**
 * Session state: which server the app talks to and who is signed in.
 * The navigation layouts read it to decide which screen to show.
 */
export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  serverUrl: null,
  token: null,
  user: null,
  needsSetup: false,

  async hydrate() {
    const serverUrl = await storage.get(SERVER_KEY);
    const token = await storage.get(TOKEN_KEY);
    if (!serverUrl) {
      set({ status: 'ready' });
      return;
    }
    set({ serverUrl });
    try {
      const { needsSetup } = await apiRequest<{ needsSetup: boolean }>(serverUrl, 'GET', '/setup');
      set({ needsSetup });
      if (token && !needsSetup) {
        const user = await apiRequest<SessionUser>(serverUrl, 'GET', '/auth/me', { token });
        set({ token, user });
      }
    } catch (err) {
      // An expired session is forgotten; an unreachable server keeps the saved address.
      if (err instanceof ApiError && err.status === 401) await storage.set(TOKEN_KEY, null);
    }
    set({ status: 'ready' });
  },

  async connect(address) {
    const serverUrl = normalizeServerUrl(address);
    const health = await apiRequest<{ status?: string }>(serverUrl, 'GET', '/health');
    if (health?.status !== 'ok') throw new ApiError(-1, 'not_integralo');
    const { needsSetup } = await apiRequest<{ needsSetup: boolean }>(serverUrl, 'GET', '/setup');
    await storage.set(SERVER_KEY, serverUrl);
    set({ serverUrl, needsSetup });
  },

  async forgetServer() {
    await storage.set(SERVER_KEY, null);
    await storage.set(TOKEN_KEY, null);
    set({ serverUrl: null, token: null, user: null, needsSetup: false });
  },

  async setup(username, password) {
    const { serverUrl } = get();
    if (!serverUrl) return;
    await apiRequest(serverUrl, 'POST', '/setup', { body: { username, password } });
    set({ needsSetup: false });
    await get().login(username, password);
  },

  async login(username, password) {
    const { serverUrl } = get();
    if (!serverUrl) return;
    const { token } = await apiRequest<{ token: string }>(serverUrl, 'POST', '/auth/login', { body: { username, password } });
    const user = await apiRequest<SessionUser>(serverUrl, 'GET', '/auth/me', { token });
    await storage.set(TOKEN_KEY, token);
    set({ token, user });
  },

  async logout() {
    const { serverUrl, token } = get();
    if (serverUrl && token) {
      await apiRequest(serverUrl, 'POST', '/auth/logout', { token }).catch(() => undefined);
    }
    await storage.set(TOKEN_KEY, null);
    set({ token: null, user: null });
  },
}));

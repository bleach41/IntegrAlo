import { create } from 'zustand';
import { ApiError, apiRequest, normalizeServerUrl } from '@/api/client';
import { IdentityMismatchError, verifyServer } from '@/features/pairing/identity';
import { storage } from '@/lib/storage';

export interface SessionUser {
  id: number;
  username: string;
  roleId: string;
  permissions: string[];
}

/** The server this app trusts: its public key (Ed25519) and its name, for showing it. */
export interface PairedServer {
  publicKey: string;
  name: string;
}

interface SessionState {
  /** "loading" until the saved server and token have been read and checked. */
  status: 'loading' | 'ready';
  serverUrl: string | null;
  token: string | null;
  user: SessionUser | null;
  needsSetup: boolean;
  paired: PairedServer | null;
  /** Set when the saved server answered with another identity: the app did not trust it. */
  identityAlert: boolean;
  hydrate(): Promise<void>;
  /**
   * Checks the server's identity and keeps it. With `pairWith` (from a QR) the server must
   * have that key; typed by hand, the first verified key is kept (trust on first use) and a
   * later different one is refused until the pairing is forgotten.
   */
  connect(address: string, pairWith?: PairedServer): Promise<void>;
  /** The paired server, already verified, now answers at another address: use it from now on. */
  moveServer(serverUrl: string): Promise<void>;
  forgetPairing(): Promise<void>;
  forgetServer(): Promise<void>;
  setup(username: string, password: string): Promise<void>;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SERVER_KEY = 'integralo.server';
const TOKEN_KEY = 'integralo.token';
/**
 * Last known user of the saved token. Lets the app open with the session when the server
 * cannot be reached (a power cut, the laptop restarting): screens show "offline" and retry,
 * instead of asking to sign in again. Only an answer 401 from the server ends the session.
 */
const USER_KEY = 'integralo.user';
const PAIRED_KEY = 'integralo.paired';

async function savedPairing(): Promise<PairedServer | null> {
  try {
    const raw = await storage.get(PAIRED_KEY);
    return raw ? (JSON.parse(raw) as PairedServer) : null;
  } catch {
    return null;
  }
}

async function savedUser(): Promise<SessionUser | null> {
  try {
    const raw = await storage.get(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

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
  paired: null,
  identityAlert: false,

  async hydrate() {
    const serverUrl = await storage.get(SERVER_KEY);
    const token = await storage.get(TOKEN_KEY);
    const paired = await savedPairing();
    set({ paired });
    if (!serverUrl) {
      set({ status: 'ready' });
      return;
    }
    set({ serverUrl });
    try {
      // First the identity, then the token: an impostor must never receive the session.
      if (paired) await verifyServer(serverUrl, paired.publicKey);
      const { needsSetup } = await apiRequest<{ needsSetup: boolean }>(serverUrl, 'GET', '/setup');
      set({ needsSetup });
      if (token && !needsSetup) {
        const user = await apiRequest<SessionUser>(serverUrl, 'GET', '/auth/me', { token });
        await storage.set(USER_KEY, JSON.stringify(user));
        set({ token, user });
      }
      if (token && needsSetup) await forget();
    } catch (err) {
      if (err instanceof IdentityMismatchError) {
        // Not the paired server: forget nothing (the real one may come back), trust nothing.
        set({ serverUrl: null, token: null, user: null, identityAlert: true });
      } else if (err instanceof ApiError && err.status === 401) {
        // The server answered: the session expired or was closed.
        await forget();
      } else if (token) {
        // The server did not answer: keep the session; queries retry until it is back, and the
        // realtime connection looks for it at another address (see relocatePairedServer).
        const user = await savedUser();
        if (user) set({ token, user });
      }
    }
    set({ status: 'ready' });
  },

  async connect(address, pairWith) {
    const serverUrl = normalizeServerUrl(address);
    const health = await apiRequest<{ status?: string; name?: string }>(serverUrl, 'GET', '/health');
    if (health?.status !== 'ok') throw new ApiError(-1, 'not_integralo');
    const expected = pairWith?.publicKey ?? get().paired?.publicKey ?? null;
    const publicKey = await verifyServer(serverUrl, expected);
    const { needsSetup } = await apiRequest<{ needsSetup: boolean }>(serverUrl, 'GET', '/setup');
    const paired = { publicKey, name: pairWith?.name || health.name || '' };
    await storage.set(PAIRED_KEY, JSON.stringify(paired));
    await storage.set(SERVER_KEY, serverUrl);
    set({ serverUrl, needsSetup, paired, identityAlert: false });
  },

  async moveServer(serverUrl) {
    await storage.set(SERVER_KEY, serverUrl);
    set({ serverUrl });
  },

  async forgetPairing() {
    await storage.set(PAIRED_KEY, null);
    set({ paired: null, identityAlert: false });
  },

  async forgetServer() {
    await storage.set(SERVER_KEY, null);
    await forget();
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
    await storage.set(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  async logout() {
    const { serverUrl, token } = get();
    if (serverUrl && token) {
      await apiRequest(serverUrl, 'POST', '/auth/logout', { token }).catch(() => undefined);
    }
    await forget();
    set({ token: null, user: null });
  },
}));

async function forget(): Promise<void> {
  await storage.set(TOKEN_KEY, null);
  await storage.set(USER_KEY, null);
}

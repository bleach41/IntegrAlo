import { ApiError } from '@/api/client';

/**
 * Error messages are returned as translation keys (not text), so they are shown in the
 * language active when they are displayed.
 */
export type MessageKey =
  | 'common.unexpectedError'
  | 'connect.unreachable'
  | 'connect.notIntegralo'
  | 'login.invalid'
  | 'login.locked'
  | 'setup.alreadyDone'
  | 'setup.invalidUsername'
  | 'setup.tooShort'
  | 'setup.mismatch'
  | 'users.exists'
  | 'users.failed';

export interface Message {
  key: MessageKey;
  params?: Record<string, string | number>;
}

export function connectionError(err: unknown): Message {
  if (err instanceof ApiError && err.status === 0) return { key: 'connect.unreachable' };
  if (err instanceof ApiError && (err.status === -1 || err.status === 404)) return { key: 'connect.notIntegralo' };
  if (err instanceof TypeError) return { key: 'connect.unreachable' }; // malformed address
  return { key: 'common.unexpectedError' };
}

export function loginError(err: unknown): Message {
  if (err instanceof ApiError && err.status === 0) return { key: 'connect.unreachable' };
  if (err instanceof ApiError && err.status === 401) {
    return { key: err.message.includes('too many') ? 'login.locked' : 'login.invalid' };
  }
  return { key: 'common.unexpectedError' };
}

export function setupError(err: unknown): Message {
  if (err instanceof ApiError && err.status === 409) return { key: 'setup.alreadyDone' };
  if (err instanceof ApiError && err.status === 0) return { key: 'connect.unreachable' };
  return { key: 'common.unexpectedError' };
}

const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;

/** Same rules as the server, checked before sending to give immediate feedback. */
export function validateNewAccount(username: string, password: string, confirm: string): Message | null {
  if (!USERNAME.test(username)) return { key: 'setup.invalidUsername' };
  if (password.length < MIN_PASSWORD) return { key: 'setup.tooShort', params: { min: MIN_PASSWORD } };
  if (password !== confirm) return { key: 'setup.mismatch' };
  return null;
}

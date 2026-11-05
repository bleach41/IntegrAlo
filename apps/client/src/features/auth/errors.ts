import { ApiError } from '@/api/client';
import { t } from '@/i18n/es';

/** Translates API errors of the connection and sign-in screens into user messages. */
export function connectionError(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return t('connect.unreachable');
  if (err instanceof ApiError && (err.status === -1 || err.status === 404)) return t('connect.notIntegralo');
  if (err instanceof TypeError) return t('connect.unreachable'); // invalid address
  return t('common.unexpectedError');
}

export function loginError(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return t('connect.unreachable');
  if (err instanceof ApiError && err.status === 401) {
    return err.message.includes('too many') ? t('login.locked') : t('login.invalid');
  }
  return t('common.unexpectedError');
}

export function setupError(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return t('setup.alreadyDone');
  if (err instanceof ApiError && err.status === 0) return t('connect.unreachable');
  return t('common.unexpectedError');
}

const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 8;

/** Same rules as the server, checked before sending to give immediate feedback. */
export function validateNewAccount(username: string, password: string, confirm: string): string | null {
  if (!USERNAME.test(username)) return t('setup.invalidUsername');
  if (password.length < MIN_PASSWORD) return t('setup.tooShort');
  if (password !== confirm) return t('setup.mismatch');
  return null;
}

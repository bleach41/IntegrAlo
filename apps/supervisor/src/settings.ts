import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Installation settings, created on first run and kept in the data directory.
 * Broker passwords are random and never typed by a person: the core receives its own,
 * and the node password is the one to program into the nodes (ESP32).
 */
export interface Settings {
  version: 1;
  httpPort: number;
  brokerPort: number;
  topicPrefix: string;
  core: { username: string; password: string };
  nodes: { username: string; password: string };
}

export const SETTINGS_FILE = 'settings.json';

export function newPassword(): string {
  // 18 random bytes → 24 URL-safe characters; easy to copy into the firmware.
  return randomBytes(18).toString('base64url');
}

export function defaultSettings(overrides: Partial<Pick<Settings, 'httpPort' | 'brokerPort' | 'topicPrefix'>> = {}): Settings {
  return {
    version: 1,
    httpPort: overrides.httpPort ?? 4100,
    brokerPort: overrides.brokerPort ?? 1883,
    topicPrefix: overrides.topicPrefix ?? 'integralo',
    core: { username: 'integralo-core', password: newPassword() },
    nodes: { username: 'integralo-node', password: newPassword() },
  };
}

/** Reads the settings, creating them the first time; returns whether they were created. */
export function loadOrCreateSettings(dataDir: string, overrides: Parameters<typeof defaultSettings>[0] = {}): { settings: Settings; created: boolean } {
  const file = join(dataDir, SETTINGS_FILE);
  if (existsSync(file)) {
    const settings = JSON.parse(readFileSync(file, 'utf8')) as Settings;
    return { settings: { ...settings, ...definedOnly(overrides) }, created: false };
  }
  const settings = defaultSettings(overrides);
  writeAtomically(file, JSON.stringify(settings, null, 2));
  return { settings, created: true };
}

export function writeAtomically(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

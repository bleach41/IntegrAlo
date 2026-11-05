import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { ZodType } from 'zod';

/**
 * File-based equivalent of the ESP32 non-volatile memory (Preferences/NVS), for any
 * module state described by a schema. The state is written to a temporary file and then
 * renamed: a power cut during the write leaves either the old or the new file, never a
 * half-written one.
 */
export class StateStorage<T> {
  constructor(
    private readonly filePath: string,
    private readonly schema: ZodType<T>,
    private readonly defaults: () => T,
  ) {}

  load(): T {
    if (!existsSync(this.filePath)) {
      return this.defaults();
    }
    try {
      return this.schema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      // A corrupt or outdated file must not prevent the node from starting.
      return this.defaults();
    }
  }

  save(state: T): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, this.filePath);
  }
}

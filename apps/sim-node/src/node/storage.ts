import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { NodeState, NodeStateSchema, defaultNodeState } from './state';

/**
 * File-based equivalent of the ESP32 non-volatile memory (Preferences/NVS).
 * The state is written to a temporary file and then renamed: a power cut during the
 * write leaves either the old or the new file, never a half-written one.
 */
export class StateStorage {
  constructor(private readonly filePath: string) {}

  load(): NodeState {
    if (!existsSync(this.filePath)) {
      return defaultNodeState();
    }
    try {
      return NodeStateSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      // A corrupt or outdated file must not prevent the node from starting.
      return defaultNodeState();
    }
  }

  save(state: NodeState): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, this.filePath);
  }
}

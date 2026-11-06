import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeAtomically } from './settings';

/**
 * Leftover broker or core from a supervisor that was ended by force (Task Manager, a
 * forced service stop): on Windows its children outlive it and keep the ports, so the next
 * start would fail. The supervisor writes down the process ID and program of each child;
 * on start, a recorded process that is still running THE SAME PROGRAM is ended. A process ID
 * that Windows reused for another program is left alone.
 */
const FILE = 'children.json';

interface Entry {
  pid: number;
  command: string;
}

export class ChildrenRecord {
  private readonly entries: Record<string, Entry> = {};

  constructor(private readonly dataDir: string) {}

  started(name: string, pid: number, command: string): void {
    this.entries[name] = { pid, command };
    writeAtomically(join(this.dataDir, FILE), JSON.stringify(this.entries, null, 2));
  }
}

export async function stopLeftovers(dataDir: string, log: (line: string) => void): Promise<void> {
  const file = join(dataDir, FILE);
  if (!existsSync(file) || process.platform !== 'win32') return;
  let entries: Record<string, Entry>;
  try {
    entries = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>;
  } catch {
    return;
  }
  const recorded = Object.entries(entries).filter(([, e]) => Number.isInteger(e?.pid) && e.pid > 0 && typeof e.command === 'string');
  if (recorded.length === 0) return;
  const running = executables(recorded.map(([, e]) => e.pid));
  let stopped = 0;
  for (const [name, entry] of recorded) {
    const path = running.get(entry.pid);
    if (!path || resolve(path).toLowerCase() !== resolve(entry.command).toLowerCase()) continue;
    try {
      process.kill(entry.pid);
      stopped++;
      log(`[supervisor] stopped a ${name} left running by a previous start (pid ${entry.pid})`);
    } catch {
      // already gone
    }
  }
  if (stopped) await new Promise((r) => setTimeout(r, 1000)); // let Windows free the ports
}

/** Program of each running process among these IDs (Windows). */
function executables(pids: number[]): Map<number, string> {
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' OR ');
  const found = new Map<number, string>();
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter '${filter}' | ForEach-Object { \"$($_.ProcessId)|$($_.ExecutablePath)\" }`],
      { encoding: 'utf8', windowsHide: true, timeout: 20_000 },
    );
    for (const line of out.split(/\r?\n/)) {
      const [pid, path] = line.trim().split('|');
      if (pid && path) found.set(Number(pid), path);
    }
  } catch {
    // without the list nothing is ended: the port check below still reports a busy port
  }
  return found;
}

import { ChildProcess, spawn } from 'node:child_process';

export interface ManagedOptions {
  name: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** Use an IPC channel and ask the child to stop with {"type":"shutdown"} (Windows has no SIGTERM). */
  ipcShutdown?: boolean;
  log: (line: string) => void;
}

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
/** A process that ran this long is considered healthy: the next restart waits the minimum again. */
const HEALTHY_AFTER_MS = 60_000;
const STOP_TIMEOUT_MS = 7000;

/**
 * A child process kept alive by the supervisor: if it exits unexpectedly it is restarted
 * after 1 s, 2 s, 4 s… (up to 30 s), so a crash loop does not overload the computer.
 */
export class ManagedProcess {
  private child?: ChildProcess;
  private stopping = false;
  private restartTimer?: NodeJS.Timeout;
  private backoffMs = MIN_BACKOFF_MS;
  private startedAt = 0;
  restarts = 0;

  constructor(private readonly options: ManagedOptions) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  /** For the server panel: running, waiting to be restarted after a failure, or stopped. */
  get state(): 'running' | 'restarting' | 'stopped' {
    if (this.restartTimer) return 'restarting';
    const child = this.child;
    return child && child.exitCode === null && child.signalCode === null ? 'running' : 'stopped';
  }

  /** Milliseconds since the current run started (0 when not running). */
  get uptimeMs(): number {
    return this.state === 'running' ? Date.now() - this.startedAt : 0;
  }

  /** Orderly stop and start again (from the server panel); not counted as a failure. */
  async restart(): Promise<void> {
    await this.stop();
    this.stopping = false;
    this.backoffMs = MIN_BACKOFF_MS;
    this.start();
  }

  start(): void {
    const { name, command, args, env, ipcShutdown, log } = this.options;
    this.startedAt = Date.now();
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ipcShutdown ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    const forward = (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) if (line.trim()) log(`[${name}] ${line}`);
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', (err) => log(`[${name}] failed to start: ${err.message}`));
    child.on('exit', (code, signal) => this.onExit(code, signal));
    log(`[supervisor] ${name} started (pid ${child.pid})`);
  }

  /** Stops the process: orderly first, forced after a timeout. */
  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    if (this.options.ipcShutdown && child.connected) child.send({ type: 'shutdown' });
    else child.kill();
    const timer = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS);
    await exited;
    clearTimeout(timer);
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    const { name, log } = this.options;
    if (this.stopping) {
      log(`[supervisor] ${name} stopped`);
      return;
    }
    if (Date.now() - this.startedAt >= HEALTHY_AFTER_MS) this.backoffMs = MIN_BACKOFF_MS;
    log(`[supervisor] ${name} exited (${signal ?? `code ${code}`}); restarting in ${this.backoffMs / 1000} s`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.restarts++;
      this.start();
    }, this.backoffMs);
    this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
  }
}

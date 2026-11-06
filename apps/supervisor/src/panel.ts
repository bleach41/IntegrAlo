import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { buildPairingPayload, type ServerHealth } from '@integralo/contract';
import qrcode from 'qrcode-generator';
import { panelPage } from './panel-page';
import type { ManagedProcess } from './process';

export interface PanelContext {
  port: number;
  httpPort: number;
  brokerPort: number;
  broker: ManagedProcess;
  core: ManagedProcess;
  hosts: () => string[];
  nodeAccount: { username: string; password: string };
  logs: () => string[];
  startedAt: number;
  log: (line: string) => void;
}

/** Header the panel's own page sends with every action; see isTrusted(). */
const PANEL_HEADER = 'x-integralo-panel';

/**
 * Server panel (RNF-06): the face of the supervisor on the server computer. It listens
 * only on 127.0.0.1, so it cannot be opened from the network, and it shows the state of
 * the broker and the core, the pairing QR, the node account and the recent log.
 */
export function startPanel(ctx: PanelContext): Promise<Server> {
  const server = createServer((req, res) => {
    handle(ctx, req, res).catch((err) => {
      ctx.log(`[panel] ${String(err)}`);
      send(res, 500, 'text/plain', 'error');
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(ctx.port, '127.0.0.1', () => resolve(server));
  });
}

async function handle(ctx: PanelContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isLocalHost(req, ctx.port)) return send(res, 421, 'text/plain', 'misdirected request');
  const path = (req.url ?? '/').split('?')[0];

  if (req.method === 'GET' && path === '/') return send(res, 200, 'text/html; charset=utf-8', panelPage());
  if (req.method === 'GET' && path === '/status') {
    if (!isTrusted(req)) return send(res, 403, 'text/plain', 'forbidden');
    return send(res, 200, 'application/json', JSON.stringify(await status(ctx)));
  }
  if (req.method === 'POST' && path === '/core/restart') {
    if (!isTrusted(req)) return send(res, 403, 'text/plain', 'forbidden');
    ctx.log('[panel] core restart requested from the server panel');
    void ctx.core.restart();
    return send(res, 202, 'application/json', '{"ok":true}');
  }
  send(res, 404, 'text/plain', 'not found');
}

/**
 * Defence against DNS rebinding: a malicious site can make the browser send requests to
 * 127.0.0.1 under its own name, but then the Host header carries that name. Only requests
 * addressed to this computer by its loopback name are answered.
 */
function isLocalHost(req: IncomingMessage, port: number): boolean {
  return req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
}

/**
 * Data and actions require a custom header. A page from another site cannot add one to a
 * request to this origin without a CORS preflight, which the panel never approves; so only
 * the panel's own page (same origin) can read the status or restart the core.
 */
function isTrusted(req: IncomingMessage): boolean {
  return req.headers[PANEL_HEADER] === '1';
}

interface ComponentStatus {
  state: 'running' | 'restarting' | 'stopped';
  pid: number | null;
  restarts: number;
  uptimeS: number;
}

export interface PanelStatus {
  supervisorUptimeS: number;
  broker: ComponentStatus & { port: number };
  core: ComponentStatus & { port: number; health: ServerHealth | null };
  addresses: string[];
  appUrl: string;
  qrSvg: string | null;
  nodeAccount: { username: string; password: string; port: number; hosts: string[] };
  logs: string[];
}

async function status(ctx: PanelContext): Promise<PanelStatus> {
  const health = await coreHealth(ctx.httpPort);
  const hosts = ctx.hosts();
  const component = (p: ManagedProcess): ComponentStatus => ({
    state: p.state,
    pid: p.pid ?? null,
    restarts: p.restarts,
    uptimeS: Math.round(p.uptimeMs / 1000),
  });
  return {
    supervisorUptimeS: Math.round((Date.now() - ctx.startedAt) / 1000),
    broker: { ...component(ctx.broker), port: ctx.brokerPort },
    core: { ...component(ctx.core), port: ctx.httpPort, health },
    addresses: hosts.map((h) => `${h}:${ctx.httpPort}`),
    appUrl: `http://localhost:${ctx.httpPort}`,
    qrSvg: health
      ? qrSvg(buildPairingPayload({ name: health.name, publicKey: health.publicKey, addresses: hosts.map((h) => `${h}:${ctx.httpPort}`) }))
      : null,
    nodeAccount: { ...ctx.nodeAccount, port: ctx.brokerPort, hosts },
    logs: ctx.logs(),
  };
}

async function coreHealth(port: number): Promise<ServerHealth | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const data = (await response.json()) as Partial<ServerHealth>;
    return data?.status === 'ok' && typeof data.publicKey === 'string' ? (data as ServerHealth) : null;
  } catch {
    return null;
  }
}

/** The pairing QR as SVG: black modules on white, with the standard 4-module margin. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  const size = n + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function send(res: ServerResponse, code: number, type: string, body: string): void {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    // The page only talks to itself and never loads anything from elsewhere.
    'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:",
    'x-frame-options': 'DENY',
  });
  res.end(body);
}

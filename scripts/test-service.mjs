// Checks the Windows service of the package WITHOUT installing it. The configuration is copied
// to service-test/ with two changes so a running IntegrAlo is not touched: a temporary data
// folder and other ports (4102/1884, panel 4103). WinSW is started without a console, as Windows
// starts services: only then can WinSW send the Ctrl+C to the supervisor.
//
// Two modes, because WinSW 2.12 asks for administrator rights (UAC) for "testwait":
// - from an elevated terminal, full check with "testwait": the service runs as configured until
//   the script stops it, so health, data folder, panel and the orderly stop are all checked;
// - otherwise, quick check with "test" (no elevation): WinSW starts the service and stops it one
//   second later, which checks the Ctrl+C stop, the log and that nothing is left running.
// The script never triggers a UAC prompt.
//
// Usage: pnpm package && node scripts/test-service.mjs [release/IntegrAlo]
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = resolve(process.argv[2] ?? join(ROOT, 'release', 'IntegrAlo'));
const SERVICE = join(PKG, 'service', 'IntegrAlo-service.exe');
const HTTP_PORT = 4102;
const BROKER_PORT = 1884;
const PANEL_PORT = HTTP_PORT + 1;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch {
      // not ready yet
    }
    await sleep(250);
  }
  return null;
}
const portOpen = (port) =>
  new Promise((done) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
  });

if (!existsSync(SERVICE)) {
  console.error(`No service wrapper in ${PKG} (pnpm package with WinSW in .tools/downloads)`);
  process.exit(1);
}

const programData = mkdtempSync(join(tmpdir(), 'integralo-service-test-'));
const dataDir = join(programData, 'IntegrAlo');
const testDir = join(PKG, 'service-test');
rmSync(testDir, { recursive: true, force: true });
mkdirSync(testDir);
copyFileSync(SERVICE, join(testDir, 'IntegrAlo-service.exe'));
const xml = readFileSync(join(PKG, 'service', 'IntegrAlo-service.xml'), 'utf8');
const testXml = xml
  .replace('--data-dir "%ProgramData%\\IntegrAlo"', `--data-dir "${dataDir}" --http-port ${HTTP_PORT} --broker-port ${BROKER_PORT} --panel-port ${PANEL_PORT}`)
  .replace('<logpath>%ProgramData%\\IntegrAlo\\logs</logpath>', `<logpath>${join(dataDir, 'logs')}</logpath>`);
if (testXml === xml || !testXml.includes(dataDir)) {
  console.error('The service configuration no longer has the expected --data-dir / logpath lines');
  process.exit(1);
}
writeFileSync(join(testDir, 'IntegrAlo-service.xml'), testXml);

// "net session" only succeeds in an elevated process.
const elevated = spawnSync('net', ['session'], { stdio: 'ignore', windowsHide: true }).status === 0;
const command = elevated ? 'testwait' : 'test';
console.log(elevated
  ? 'Elevated terminal: full check with WinSW "testwait".'
  : 'Not elevated: quick check with WinSW "test" (start, 1 s, stop). For the full check, run it from a terminal opened as administrator.');

const env = { ...process.env };
delete env.INTEGRALO_MOSQUITTO_DIR;
delete env.INTEGRALO_DATA_DIR;
// detached: no console, as a real service (WinSW can then attach to the supervisor's).
const service = spawn(join(testDir, 'IntegrAlo-service.exe'), [command], { env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
let console_ = '';
service.stdout.on('data', (c) => (console_ += c));
service.stderr.on('data', (c) => (console_ += c));
const exited = new Promise((done) => service.once('exit', (code) => done(code)));

try {
  if (elevated) {
    const health = await until(async () => {
      const h = await (await fetch(`http://127.0.0.1:${HTTP_PORT}/api/health`)).json();
      return h.broker === 'connected' ? h : null;
    }, 40_000);
    check('service starts the supervisor, the broker and the core (core linked to the broker)', !!health);
    check('service creates its data folder on first start', existsSync(join(dataDir, 'settings.json')) && existsSync(join(dataDir, 'integralo.sqlite')));
    const panel = await fetch(`http://127.0.0.1:${PANEL_PORT}/status`, { headers: { 'x-integralo-panel': '1' } }).then((r) => r.json()).catch(() => null);
    check('server panel answers', panel?.core?.state === 'running' && panel?.broker?.state === 'running');

    // Stop as Windows would: WinSW sends Ctrl+C to the supervisor first.
    service.stdin.write('\n');
    const code = await Promise.race([exited, sleep(30_000).then(() => 'timeout')]);
    await sleep(500);
    const freed = !(await portOpen(HTTP_PORT)) && !(await portOpen(BROKER_PORT)) && !(await portOpen(PANEL_PORT));
    check('stopping the service frees every port', code !== 'timeout' && freed, `exit ${code}`);
  } else {
    // "test" stops the service by itself one second after starting it.
    const code = await Promise.race([exited, sleep(30_000).then(() => 'timeout')]);
    await sleep(500);
    const freed = !(await portOpen(HTTP_PORT)) && !(await portOpen(BROKER_PORT)) && !(await portOpen(PANEL_PORT));
    check('quick start and stop: WinSW ends and every port is free', code !== 'timeout' && freed, `exit ${code}`);
  }

  const logs = join(dataDir, 'logs');
  const out = existsSync(logs) ? readdirSync(logs).filter((f) => f.endsWith('.out.log')).map((f) => readFileSync(join(logs, f), 'utf8')).join('') : '';
  const wrapper = existsSync(logs) ? readdirSync(logs).filter((f) => f.endsWith('.wrapper.log')).map((f) => readFileSync(join(logs, f), 'utf8')).join('') : '';
  check('service log written to its log folder, without console color codes', out.includes('[supervisor] data directory') && !out.includes('\u001b['));
  check('WinSW stopped the supervisor with Ctrl+C, not by force', /canceled with code 0/.test(wrapper) && !/Failed to attach|did not respond|as fallback/i.test(wrapper), wrapper.match(/WARN.*$/m)?.[0] ?? '');
  if (elevated) check('orderly stop: the supervisor stopped the core and then the broker',
      /\[supervisor\] stopping/.test(out) && /core stopped/.test(out) && /broker stopped/.test(out) && out.indexOf('core stopped') < out.indexOf('broker stopped'));
  check('no component was restarted while stopping', !/exited \(.*\); restarting/.test(out));
} finally {
  if (service.exitCode === null) service.kill();
  await sleep(300);
  rmSync(testDir, { recursive: true, force: true });
  if (process.env.KEEP) console.log(`kept: ${programData}`);
  else rmSync(programData, { recursive: true, force: true });
}

if (failures && console_.trim()) console.log(`\nWinSW output:\n${console_.trim()}`);
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;

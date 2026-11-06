/**
 * The server panel page: one self-contained HTML document (no build step, nothing loaded
 * from elsewhere), with the colors of the app. It asks /status every 2 s; log lines and
 * every other value are inserted as text, never as HTML.
 */
export function panelPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IntegrAlo · Servidor</title>
<style>
:root { --canvas:#0a110e; --surface:#111c17; --line:#1f3029; --ink:#e7f2ec; --muted:#8aa398; --accent:#34d399; --accent-strong:#10b981; --on-accent:#04120c; --danger:#f87171; --warning:#fbbf24; }
@media (prefers-color-scheme: light) { :root { --canvas:#f4f8f6; --surface:#ffffff; --line:#d7e3dd; --ink:#0f1d17; --muted:#5b7067; --accent:#059669; --accent-strong:#047857; --on-accent:#ffffff; --danger:#dc2626; --warning:#d97706; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--canvas); color:var(--ink); font:15px/1.5 system-ui, "Segoe UI", sans-serif; }
main { max-width:1100px; margin:0 auto; padding:28px 20px 40px; }
header { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:22px; flex-wrap:wrap; }
h1 { margin:0; font-size:28px; letter-spacing:-.5px; } h1 span { color:var(--accent); }
.sub { color:var(--muted); font-size:13px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; }
.card { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:18px 20px; }
.card h2 { margin:0 0 12px; font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
.row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:9px 0; border-top:1px solid var(--line); }
.row:first-of-type { border-top:0; }
.label { color:var(--muted); font-size:14px; } .value { font-family:ui-monospace, Consolas, monospace; font-size:13px; text-align:right; word-break:break-all; }
.pill { display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:600; }
.pill::before { content:""; width:8px; height:8px; border-radius:50%; background:currentColor; }
.ok { color:var(--accent); background:color-mix(in srgb, var(--accent) 15%, transparent); }
.warn { color:var(--warning); background:color-mix(in srgb, var(--warning) 15%, transparent); }
.bad { color:var(--danger); background:color-mix(in srgb, var(--danger) 15%, transparent); }
.qr { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
.qr .code { width:190px; height:190px; border-radius:12px; overflow:hidden; background:#fff; flex:none; }
.qr .code svg { width:100%; height:100%; display:block; }
button, a.btn { font:inherit; font-size:14px; font-weight:600; border:0; border-radius:999px; padding:8px 16px; cursor:pointer; text-decoration:none; display:inline-block; }
.soft { background:color-mix(in srgb, var(--accent) 15%, transparent); color:var(--accent); }
.danger { background:color-mix(in srgb, var(--warning) 15%, transparent); color:var(--warning); }
.solid-danger { background:var(--danger); color:#fff; }
.actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
pre { margin:0; max-height:320px; overflow:auto; font:12px/1.55 ui-monospace, Consolas, monospace; color:var(--muted); white-space:pre-wrap; word-break:break-all; }
.wide { grid-column:1 / -1; }
.hint { color:var(--muted); font-size:13px; margin:0 0 10px; }
#addresses { white-space:pre-line; }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Integr<span>Alo</span> · Servidor</h1>
      <div class="sub" id="identity">Conectando con el supervisor…</div>
    </div>
    <div class="sub" id="uptime"></div>
  </header>

  <div class="grid">
    <section class="card">
      <h2>Estado</h2>
      <div class="row"><span class="label">Núcleo</span><span id="core-state"></span></div>
      <div class="row"><span class="label">Broker MQTT</span><span id="broker-state"></span></div>
      <div class="row"><span class="label">Núcleo ↔ broker</span><span id="link-state"></span></div>
      <div class="row"><span class="label">Reinicios por fallo</span><span class="value" id="restarts"></span></div>
      <div class="actions">
        <a class="btn soft" id="open-app" target="_blank" rel="noopener">Abrir la aplicación</a>
        <button class="danger" id="restart">Reiniciar el núcleo</button>
      </div>
    </section>

    <section class="card">
      <h2>Vincular un teléfono</h2>
      <div class="qr">
        <div class="code" id="qr"></div>
        <div>
          <p class="hint">En la app del teléfono: «Escanear código QR». El teléfono comprobará la identidad de este servidor y solo confiará en él.</p>
          <div class="label">Direcciones en la red</div>
          <div class="value" style="text-align:left" id="addresses"></div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Conectar un nodo (ESP32)</h2>
      <div class="row"><span class="label">Servidor MQTT</span><span class="value" id="node-hosts"></span></div>
      <div class="row"><span class="label">Puerto</span><span class="value" id="node-port"></span></div>
      <div class="row"><span class="label">Usuario</span><span class="value" id="node-user"></span></div>
      <div class="row"><span class="label">Contraseña</span><span class="value" id="node-pass">••••••••••••</span></div>
      <div class="actions"><button class="soft" id="reveal">Mostrar contraseña</button></div>
    </section>

    <section class="card wide">
      <h2>Registro reciente</h2>
      <pre id="logs"></pre>
    </section>
  </div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const STATES = { running: ['ok', 'En marcha'], restarting: ['warn', 'Reiniciando'], stopped: ['bad', 'Detenido'] };
let last = null, reveal = false, confirmTimer = null;

function pill(el, cls, text) { el.className = 'pill ' + cls; el.textContent = text; }
function duration(s) {
  if (!s) return '—';
  const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return d ? d + ' d ' + h + ' h' : h ? h + ' h ' + m + ' min' : m ? m + ' min' : s + ' s';
}

async function refresh() {
  try {
    const res = await fetch('/status', { headers: { 'x-integralo-panel': '1' }, cache: 'no-store' });
    last = await res.json();
  } catch { last = null; }
  render();
}

function render() {
  if (!last) { $('identity').textContent = 'El supervisor no responde.'; return; }
  const s = last, h = s.core.health;
  $('identity').textContent = h ? h.name + ' · identificador ' + h.serverId : 'Esperando al núcleo…';
  $('uptime').textContent = 'Supervisor en marcha desde hace ' + duration(s.supervisorUptimeS);
  const core = STATES[s.core.state], broker = STATES[s.broker.state];
  pill($('core-state'), core[0], core[1] + (s.core.state === 'running' ? ' · ' + duration(s.core.uptimeS) : ''));
  pill($('broker-state'), broker[0], broker[1] + (s.broker.state === 'running' ? ' · puerto ' + s.broker.port : ''));
  if (!h) pill($('link-state'), 'bad', 'Sin respuesta del núcleo');
  else if (h.broker === 'connected') pill($('link-state'), 'ok', 'Conectado');
  else pill($('link-state'), 'warn', 'Desconectado');
  $('restarts').textContent = 'núcleo ' + s.core.restarts + ' · broker ' + s.broker.restarts;
  $('open-app').href = s.appUrl;
  if (s.qrSvg) $('qr').innerHTML = s.qrSvg; // generated by the supervisor itself, not user text
  $('addresses').textContent = s.addresses.join('\\n') || '—';
  $('node-hosts').textContent = s.nodeAccount.hosts.join(' · ') || '—';
  $('node-port').textContent = s.nodeAccount.port;
  $('node-user').textContent = s.nodeAccount.username;
  $('node-pass').textContent = reveal ? s.nodeAccount.password : '••••••••••••';
  const pre = $('logs'), atBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 30;
  pre.textContent = s.logs.join('\\n');
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

$('reveal').onclick = () => { reveal = !reveal; $('reveal').textContent = reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'; render(); };
$('restart').onclick = async () => {
  const btn = $('restart');
  if (!confirmTimer) {
    btn.textContent = '¿Seguro? Pulsa de nuevo'; btn.className = 'solid-danger';
    confirmTimer = setTimeout(() => { confirmTimer = null; btn.textContent = 'Reiniciar el núcleo'; btn.className = 'danger'; }, 4000);
    return;
  }
  clearTimeout(confirmTimer); confirmTimer = null;
  btn.textContent = 'Reiniciando…'; btn.disabled = true;
  await fetch('/core/restart', { method: 'POST', headers: { 'x-integralo-panel': '1' } }).catch(() => {});
  setTimeout(() => { btn.textContent = 'Reiniciar el núcleo'; btn.className = 'danger'; btn.disabled = false; }, 4000);
};
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;
}

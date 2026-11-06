// Builds the self-contained IntegrAlo folder (RNF-06) in release/IntegrAlo, from what is
// already compiled (`pnpm build`) and installed: nothing is downloaded. The folder keeps
// the monorepo layout (apps/<name>/dist, modules/), so the supervisor finds the core, the
// web client and the module manifests exactly as during development:
//
//   node/node.exe          the Node.js runtime in use now (no Node needed on the target)
//   mosquitto/             the MQTT broker, with its licences and the C runtime it needs
//   apps/supervisor|server production code, each with its own flat node_modules
//   apps/client/dist       web version of the app (optional: only if it was exported)
//   modules/<id>/          module manifests
//   service/               Windows service wrapper (WinSW) and its configuration
//   IntegrAlo.cmd          starts the supervisor with the data in %ProgramData%\IntegrAlo
//
// Usage: pnpm package   [--mosquitto-dir "C:/Program Files/mosquitto"] [--winsw WinSW.NET461.exe]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'release', 'IntegrAlo');
const { values } = parseArgs({
  options: {
    'mosquitto-dir': { type: 'string', default: process.env.INTEGRALO_MOSQUITTO_DIR ?? 'C:/Program Files/mosquitto' },
    /** WinSW.NET461.exe, the Windows service wrapper; by default looked for in .tools/. */
    winsw: { type: 'string' },
  },
});

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const step = (text) => console.log(`- ${text}`);

function fail(text) {
  console.error(`package: ${text}`);
  process.exit(1);
}

// What is shipped from a compiled dist/: not the tests, the e2e runners, source maps or typings.
function keepCompiled(path) {
  const name = path.split(sep).pop();
  if (name === 'e2e' && statSync(path).isDirectory()) return false;
  return !/\.(test\.js|map|d\.ts)$/.test(name);
}

/** Copies a workspace package as it would be published: package.json plus its "files". */
function copyWorkspacePackage(from, to) {
  const pkg = readJson(join(from, 'package.json'));
  mkdirSync(to, { recursive: true });
  const { devDependencies, scripts, ...published } = pkg;
  writeFileSync(join(to, 'package.json'), JSON.stringify(published, null, 2) + '\n');
  for (const entry of pkg.files ?? fail(`${pkg.name} has no "files" field`)) {
    cpSync(join(from, entry), join(to, entry), { recursive: true, filter: keepCompiled });
  }
}

/**
 * Production dependencies of a package, as a flat node_modules with real folders (no
 * pnpm links, which an installer would not keep). Each dependency is found where Node
 * itself would find it from the package that requires it, so the versions are exactly
 * the ones tested; a second version of a package goes under the one that needs it.
 */
function installDependencies(appDir, targetDir) {
  const placed = new Map(); // name → { version, dir } at the top level
  const seen = new Set();

  function locate(name, fromDir) {
    for (let dir = fromDir; ; dir = dirname(dir)) {
      const candidate = join(dir, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
      if (dirname(dir) === dir) return null;
    }
  }

  function dependenciesOf(pkg) {
    const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
    const peersOptional = new Set(Object.entries(pkg.peerDependenciesMeta ?? {}).filter(([, m]) => m?.optional).map(([n]) => n));
    const names = [...Object.keys(pkg.dependencies ?? {}), ...optional, ...Object.keys(pkg.peerDependencies ?? {}).filter((n) => !peersOptional.has(n))];
    return [...new Set(names)].map((name) => ({ name, optional: optional.has(name) }));
  }

  function add(name, sourceDir, parentTarget) {
    const pkg = readJson(join(sourceDir, 'package.json'));
    const top = placed.get(name);
    let target;
    if (!top) {
      target = join(targetDir, 'node_modules', name);
      placed.set(name, { version: pkg.version, dir: target });
    } else if (top.version === pkg.version) {
      return; // already there
    } else {
      target = join(parentTarget, 'node_modules', name);
    }
    const key = `${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    const isWorkspace = !relative(ROOT, sourceDir).split(sep).includes('.pnpm');
    if (isWorkspace) copyWorkspacePackage(sourceDir, target);
    else cpSync(sourceDir, target, { recursive: true, dereference: true, filter: (p) => !p.slice(sourceDir.length).split(sep).includes('node_modules') });
    for (const dep of dependenciesOf(pkg)) {
      const found = locate(dep.name, sourceDir);
      if (!found) {
        if (dep.optional) continue;
        fail(`${pkg.name} needs ${dep.name}, which is not installed`);
      }
      add(dep.name, found, target);
    }
  }

  const app = readJson(join(appDir, 'package.json'));
  for (const name of Object.keys(app.dependencies ?? {})) {
    const found = locate(name, appDir) ?? fail(`${app.name} needs ${name}, which is not installed (pnpm install)`);
    add(name, found, targetDir);
  }
  return placed.size;
}

function copyApp(name) {
  const from = join(ROOT, 'apps', name);
  const to = join(OUT, 'apps', name);
  if (!existsSync(join(from, 'dist', 'main.js'))) fail(`apps/${name} is not compiled (pnpm build)`);
  copyWorkspacePackage(from, to);
  const count = installDependencies(from, to);
  step(`apps/${name}: compiled code and ${count} packages`);
}

// --- start -------------------------------------------------------------------------------
console.log(`IntegrAlo package → ${OUT}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Runtime: the Node.js running this script, which is the version every test used.
mkdirSync(join(OUT, 'node'));
cpSync(process.execPath, join(OUT, 'node', 'node.exe'));
const nodeLicense = join(dirname(process.execPath), 'LICENSE');
if (existsSync(nodeLicense)) cpSync(nodeLicense, join(OUT, 'node', 'LICENSE'));
step(`node ${process.version}`);

// Broker: Mosquitto's programs and libraries, its licences (EPL-2.0 / EDL-1.0 allow
// redistribution) and vcruntime140.dll, which Mosquitto needs and a clean Windows may
// lack (Microsoft allows shipping it next to the program that uses it).
const mosquitto = values['mosquitto-dir'];
if (!existsSync(join(mosquitto, 'mosquitto.exe'))) fail(`Mosquitto not found in ${mosquitto} (--mosquitto-dir)`);
const brokerOut = join(OUT, 'mosquitto');
mkdirSync(brokerOut);
for (const file of readdirSync(mosquitto)) {
  if (/\.dll$/i.test(file) || ['mosquitto.exe', 'mosquitto_passwd.exe', 'NOTICE.md', 'edl-v10', 'epl-v20'].includes(file)) {
    cpSync(join(mosquitto, file), join(brokerOut, file), { recursive: true });
  }
}
const vcruntime = join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'vcruntime140.dll');
if (existsSync(vcruntime)) cpSync(vcruntime, join(brokerOut, 'vcruntime140.dll'));
else console.warn('  warning: vcruntime140.dll not found; the target needs the Visual C++ runtime');
step(`mosquitto from ${mosquitto}`);

copyApp('supervisor');
copyApp('server');

const web = join(ROOT, 'apps', 'client', 'dist');
if (existsSync(join(web, 'index.html'))) {
  // The export keeps expo-router's own icons (error and site-map screens, which the app does
  // not use) under assets/__node_modules/.pnpm/<very long name>/…: paths over Windows' 260
  // characters once installed, which the installer cannot handle. They are left out.
  const skipped = [];
  cpSync(web, join(OUT, 'apps', 'client', 'dist'), {
    recursive: true,
    filter: (p) => {
      const inside = relative(web, p).split(sep);
      if (inside[0] === 'assets' && inside[1] === '__node_modules') {
        if (inside.length === 2) skipped.push(p);
        return false;
      }
      return true;
    },
  });
  step(`web client (exported ${statSync(join(web, 'index.html')).mtime.toISOString().slice(0, 10)})${skipped.length ? '; left out expo-router internal icons (paths too long)' : ''}`);
} else {
  step('web client not exported: the package serves only the mobile app');
}

for (const entry of readdirSync(join(ROOT, 'modules'), { withFileTypes: true })) {
  const manifest = join(ROOT, 'modules', entry.name, 'manifest.json');
  if (entry.isDirectory() && existsSync(manifest)) cpSync(manifest, join(OUT, 'modules', entry.name, 'manifest.json'));
}
step(`modules: ${readdirSync(join(OUT, 'modules')).join(', ')}`);

// Windows service wrapper (WinSW, MIT): the exe and its configuration share a name.
const winsw = values.winsw ?? [join(ROOT, '.tools', 'downloads', 'WinSW.NET461.exe'), join(ROOT, '.tools', 'WinSW.NET461.exe')].find(existsSync);
if (winsw && existsSync(winsw)) {
  const serviceOut = join(OUT, 'service');
  mkdirSync(serviceOut);
  cpSync(winsw, join(serviceOut, 'IntegrAlo-service.exe'));
  cpSync(join(ROOT, 'installer', 'IntegrAlo-service.xml'), join(serviceOut, 'IntegrAlo-service.xml'));
  const license = join(dirname(winsw), 'WinSW-LICENSE.txt');
  if (existsSync(license)) cpSync(license, join(serviceOut, 'WinSW-LICENSE.txt'));
  else console.warn('  warning: WinSW-LICENSE.txt not found next to WinSW (the MIT licence must be shipped)');
  step(`service wrapper from ${winsw}`);
} else {
  step('service wrapper not found (.tools/downloads/WinSW.NET461.exe or --winsw): package without service');
}

// Launcher, for running the package by hand (the Windows service uses the same command).
writeFileSync(
  join(OUT, 'IntegrAlo.cmd'),
  [
    '@echo off',
    'rem IntegrAlo: starts the supervisor (broker + core). Data in %ProgramData%\\IntegrAlo.',
    '"%~dp0node\\node.exe" "%~dp0apps\\supervisor\\dist\\main.js" --data-dir "%ProgramData%\\IntegrAlo" %*',
    '',
  ].join('\r\n'),
);
const version = readJson(join(ROOT, 'package.json')).version;
writeFileSync(join(OUT, 'VERSION'), `${version}\n`);

// Third-party software shipped in the package, with the licence each one is used under.
writeFileSync(
  join(OUT, 'TERCEROS.txt'),
  [
    'IntegrAlo incluye los siguientes programas de terceros, sin modificar:',
    '',
    `- Node.js ${process.version} (node/): licencia MIT, texto en node/LICENSE.`,
    '- Eclipse Mosquitto (mosquitto/): doble licencia EPL-2.0 / EDL-1.0, textos en mosquitto/epl-v20 y mosquitto/edl-v10.',
    '- Microsoft Visual C++ runtime, vcruntime140.dll (mosquitto/): redistribuible junto al programa que lo usa.',
    '- WinSW 2.12.0 (service/): licencia MIT, texto en service/WinSW-LICENSE.txt.',
    '- Bibliotecas de Node.js en apps/*/node_modules: cada una con su licencia dentro de su carpeta.',
    '',
  ].join('\r\n'),
);

let bytes = 0;
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else bytes += statSync(p).size;
  }
};
walk(OUT);
console.log(`Done: IntegrAlo ${version}, ${(bytes / 1048576).toFixed(1)} MB.`);

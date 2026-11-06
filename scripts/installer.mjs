// Compiles release/IntegrAlo-Setup-<version>.exe from the package (pnpm package) with
// Inno Setup 6. Only builds the installer: it never runs it (installing the service, the
// firewall rules and the data folder permissions is the administrator's decision).
//
// Usage: pnpm installer   (= pnpm package, then this script)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'release', 'IntegrAlo');

const iscc = [
  process.env.ISCC,
  join(ROOT, '.tools', 'InnoSetup', 'ISCC.exe'),
  join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
].find((p) => p && existsSync(p));
if (!iscc) {
  console.error('installer: Inno Setup 6 not found (ISCC env, .tools/InnoSetup or the default install folders)');
  process.exit(1);
}
if (!existsSync(join(PKG, 'service', 'IntegrAlo-service.exe'))) {
  console.error('installer: the package has no service wrapper; run pnpm package with WinSW in .tools/downloads');
  process.exit(1);
}

const version = readFileSync(join(PKG, 'VERSION'), 'utf8').trim();
execFileSync(iscc, ['/Q', `/DSourceDir=${PKG}`, `/DAppVersion=${version}`, `/O${join(ROOT, 'release')}`, join(ROOT, 'installer', 'IntegrAlo.iss')], { stdio: 'inherit' });
const setup = join(ROOT, 'release', `IntegrAlo-Setup-${version}.exe`);
console.log(`Installer: ${setup} (${(statSync(setup).size / 1048576).toFixed(1)} MB)`);

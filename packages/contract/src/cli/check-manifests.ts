import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleManifestSchema } from '../manifest';

/** Validates every modules/<name>/manifest.json against the contract. Exit code 1 on any error. */
function main(modulesDir: string): number {
  let failures = 0;
  const dirs = readdirSync(modulesDir, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const file = join(modulesDir, dir.name, 'manifest.json');
    if (!existsSync(file)) {
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`✗ ${dir.name}: invalid JSON (${(err as Error).message})`);
      failures++;
      continue;
    }
    const result = ModuleManifestSchema.safeParse(raw);
    if (result.success) {
      console.log(`✓ ${dir.name}: ${result.data.id}@${result.data.version}`);
    } else {
      failures++;
      console.error(`✗ ${dir.name}:`);
      for (const issue of result.error.issues) {
        console.error(`    ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }
  }
  return failures === 0 ? 0 : 1;
}

process.exit(main(process.argv[2] ?? 'modules'));

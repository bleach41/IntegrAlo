import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModuleManifest, ModuleManifestSchema } from '@integralo/contract';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';

/**
 * Loads the module manifests found in the modules directory (requirement RF-07).
 * The core knows modules only through their manifests: adding a module means adding
 * a folder with a manifest.json, without changing this code.
 */
@Injectable()
export class ModuleRegistryService {
  private readonly logger = new Logger(ModuleRegistryService.name);
  private readonly modules = new Map<string, ModuleManifest>();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.load(config.modulesDir);
  }

  get(id: string): ModuleManifest | undefined {
    return this.modules.get(id);
  }

  list(): ModuleManifest[] {
    return [...this.modules.values()];
  }

  private load(dir: string): void {
    if (!existsSync(dir)) {
      this.logger.warn(`modules directory not found: ${dir}`);
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name, 'manifest.json');
      if (!entry.isDirectory() || !existsSync(file)) continue;
      const result = ModuleManifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (!result.success) {
        this.logger.error(`invalid manifest in ${entry.name}: ${result.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      this.modules.set(result.data.id, result.data);
      this.logger.log(`module loaded: ${result.data.id}@${result.data.version}`);
    }
  }
}

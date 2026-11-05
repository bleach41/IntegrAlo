import { ModuleManifestSchema, ParameterDef } from '@integralo/contract';
import rawManifest from '../manifest.json';

/** The manifest is validated when the module is loaded: an invalid manifest fails fast. */
export const manifest = ModuleManifestSchema.parse(rawManifest);

export function numberParameter(key: string): Extract<ParameterDef, { type: 'number' }> {
  const def = manifest.parameters[key];
  if (!def || def.type !== 'number') {
    throw new Error(`Manifest has no numeric parameter "${key}"`);
  }
  return def;
}

export function enumParameter(key: string): Extract<ParameterDef, { type: 'enum' }> {
  const def = manifest.parameters[key];
  if (!def || def.type !== 'enum') {
    throw new Error(`Manifest has no enum parameter "${key}"`);
  }
  return def;
}

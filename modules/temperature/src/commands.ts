import { z } from 'zod';
import { enumParameter, manifest, numberParameter } from './manifest';

/**
 * Payload schemas of the temperature module's commands.
 * Limits come from the manifest, so they are declared in a single place.
 */

function numberFromManifest(key: string) {
  const def = numberParameter(key);
  let schema = z.number();
  if (def.min !== undefined) schema = schema.min(def.min);
  if (def.max !== undefined) schema = schema.max(def.max);
  return schema;
}

function modeValues(): [string, ...string[]] {
  const mode = manifest.variables.find((v) => v.key === 'mode');
  if (!mode || mode.type !== 'enum') {
    throw new Error('Manifest has no enum variable "mode"');
  }
  return mode.values as [string, ...string[]];
}

export const ModeSchema = z.enum(modeValues());
export type Mode = z.infer<typeof ModeSchema>;

export const AlgorithmSchema = z.enum(enumParameter('algorithm').values as [string, ...string[]]);
export type Algorithm = z.infer<typeof AlgorithmSchema>;

export const ControlParamsSchema = z.object({
  algorithm: AlgorithmSchema,
  hysteresis: numberFromManifest('hysteresis'),
  kp: numberFromManifest('kp'),
  ki: numberFromManifest('ki'),
  samplePeriodMs: numberFromManifest('samplePeriodMs').int(),
  setpointMin: numberFromManifest('setpointMin'),
  setpointMax: numberFromManifest('setpointMax'),
});
export type ControlParams = z.infer<typeof ControlParamsSchema>;

/** Simulated disturbance: it configures the test bench, not the control system. */
export const DisturbanceSchema = z.enum(['off', 'step', 'daily']);
export type Disturbance = z.infer<typeof DisturbanceSchema>;

export const SimulationConfigSchema = z.object({
  disturbance: DisturbanceSchema,
  outdoorBaseC: z.number().min(-10).max(50),
  amplitudeC: z.number().min(0).max(20),
});
export type SimulationConfig = z.infer<typeof SimulationConfigSchema>;

export const TemperatureCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_setpoint'), payload: z.object({ setpoint: z.number() }).strict() }),
  z.object({ type: z.literal('set_mode'), payload: z.object({ mode: ModeSchema }).strict() }),
  z.object({ type: z.literal('set_output'), payload: z.object({ output: z.number().min(0).max(100) }).strict() }),
  z.object({ type: z.literal('set_params'), payload: ControlParamsSchema.partial().strict() }),
  z.object({ type: z.literal('set_simulation'), payload: SimulationConfigSchema.partial().strict() }),
]);
export type TemperatureCommand = z.infer<typeof TemperatureCommandSchema>;

/** Initial control parameters taken from the manifest defaults. */
export function defaultControlParams(): ControlParams {
  const num = (key: string) => {
    const value = numberParameter(key).default;
    if (value === undefined) throw new Error(`Manifest parameter "${key}" has no default`);
    return value;
  };
  return ControlParamsSchema.parse({
    algorithm: enumParameter('algorithm').default,
    hysteresis: num('hysteresis'),
    kp: num('kp'),
    ki: num('ki'),
    samplePeriodMs: num('samplePeriodMs'),
    setpointMin: num('setpointMin'),
    setpointMax: num('setpointMax'),
  });
}

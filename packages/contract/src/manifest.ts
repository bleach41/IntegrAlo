import { z } from 'zod';

/**
 * Module manifest: what a module declares so the core can handle it
 * without containing any module-specific code (requirement RF-07).
 */

const KeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'keys must be camelCase');

export const VariableDefSchema = z.discriminatedUnion('type', [
  z.object({
    key: KeySchema,
    type: z.literal('number'),
    unit: z.string().optional(),
    simulated: z.boolean().optional(),
  }),
  z.object({
    key: KeySchema,
    type: z.literal('enum'),
    values: z.array(z.string()).min(1),
    simulated: z.boolean().optional(),
  }),
  z.object({
    key: KeySchema,
    type: z.literal('boolean'),
    simulated: z.boolean().optional(),
  }),
]);
export type VariableDef = z.infer<typeof VariableDefSchema>;

export const ParameterDefSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('number'),
    unit: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.number().optional(),
  }),
  z.object({
    type: z.literal('enum'),
    values: z.array(z.string()).min(1),
    default: z.string().optional(),
  }),
]);
export type ParameterDef = z.infer<typeof ParameterDefSchema>;

export const AlarmDefSchema = z.object({
  key: KeySchema,
  variable: KeySchema,
  type: z.enum(['high', 'low']),
});
export type AlarmDef = z.infer<typeof AlarmDefSchema>;

export const ModuleManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)'),
    variables: z.array(VariableDefSchema).min(1),
    commands: z.array(z.string().regex(/^[a-z][a-z_]*$/)).min(1),
    parameters: z.record(ParameterDefSchema),
    alarms: z.array(AlarmDefSchema),
    views: z.array(z.string()).min(1),
  })
  .superRefine((manifest, ctx) => {
    const keys = manifest.variables.map((v) => v.key);
    const duplicated = keys.filter((k, i) => keys.indexOf(k) !== i);
    for (const key of new Set(duplicated)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicated variable "${key}"` });
    }
    for (const alarm of manifest.alarms) {
      const variable = manifest.variables.find((v) => v.key === alarm.variable);
      if (!variable) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `alarm "${alarm.key}" refers to unknown variable "${alarm.variable}"` });
      } else if (variable.type !== 'number') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `alarm "${alarm.key}" needs a numeric variable` });
      }
    }
    for (const [name, param] of Object.entries(manifest.parameters)) {
      if (param.type === 'number' && param.min !== undefined && param.max !== undefined && param.min > param.max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `parameter "${name}" has min > max` });
      }
    }
  });
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

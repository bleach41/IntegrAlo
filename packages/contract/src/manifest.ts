import { z } from 'zod';

/**
 * Module manifest: what a module declares so the core can handle it
 * without containing any module-specific code (requirement RF-07).
 */

const KeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'keys must be camelCase');

/** Text in several languages, by language code: { "es": "Temperatura", "en": "Temperature" }. */
export const LocalizedTextSchema = z.record(z.string().regex(/^[a-z]{2}$/), z.string().min(1));
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Picks the text for a language, falling back to Spanish, then any language, then the fallback. */
export function localize(text: LocalizedText | undefined, language: string, fallback: string): string {
  if (!text) return fallback;
  return text[language] ?? text.es ?? Object.values(text)[0] ?? fallback;
}

const variableCommon = {
  key: KeySchema,
  /** Name shown in the interfaces; the key is shown if missing. */
  label: LocalizedTextSchema.optional(),
  simulated: z.boolean().optional(),
};

export const VariableDefSchema = z.discriminatedUnion('type', [
  z.object({
    ...variableCommon,
    type: z.literal('number'),
    unit: z.string().optional(),
    /** Decimals shown in the interfaces. */
    decimals: z.number().int().min(0).max(6).optional(),
  }),
  z.object({
    ...variableCommon,
    type: z.literal('enum'),
    values: z.array(z.string()).min(1),
    valueLabels: z.record(LocalizedTextSchema).optional(),
  }),
  z.object({
    ...variableCommon,
    type: z.literal('boolean'),
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

/** A field of a command payload; clients build the command form from it. */
export const CommandFieldDefSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('number'),
    label: LocalizedTextSchema.optional(),
    unit: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    /** Increment of the +/− controls. */
    step: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('enum'),
    label: LocalizedTextSchema.optional(),
    values: z.array(z.string()).min(1),
    valueLabels: z.record(LocalizedTextSchema).optional(),
  }),
]);
export type CommandFieldDef = z.infer<typeof CommandFieldDefSchema>;

export const CommandDefSchema = z.object({
  type: z.string().regex(/^[a-z][a-z_]*$/),
  label: LocalizedTextSchema.optional(),
  fields: z.record(KeySchema, CommandFieldDefSchema),
  /** True when any subset of the fields may be sent (e.g. changing one control parameter). */
  partial: z.boolean().optional(),
});
export type CommandDef = z.infer<typeof CommandDefSchema>;

export const AlarmDefSchema = z.object({
  key: KeySchema,
  label: LocalizedTextSchema.optional(),
  variable: KeySchema,
  type: z.enum(['high', 'low']),
  /** Initial threshold for a newly approved node; adjustable per node afterwards. */
  defaultThreshold: z.number().optional(),
  /** Hysteresis to clear the alarm, which avoids chattering around the threshold. */
  defaultDeadband: z.number().nonnegative().optional(),
});
export type AlarmDef = z.infer<typeof AlarmDefSchema>;

export const ModuleManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)'),
    variables: z.array(VariableDefSchema).min(1),
    commands: z.array(CommandDefSchema).min(1),
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
    const types = manifest.commands.map((c) => c.type);
    for (const type of new Set(types.filter((t, i) => types.indexOf(t) !== i))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicated command "${type}"` });
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

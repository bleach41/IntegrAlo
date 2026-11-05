import { z } from 'zod';

/** Persistent state of the tank node (equivalent to the ESP32 non-volatile memory). */
export const TankStateSchema = z.object({
  mode: z.enum(['off', 'manual', 'auto']),
  /** Pump state requested in manual mode. */
  manualPump: z.enum(['off', 'on']),
  startLevel: z.number().min(5).max(90),
  stopLevel: z.number().min(10).max(100),
  samplePeriodMs: z.number().int().min(500).max(60000),
  consumptionLpm: z.number().min(0).max(60),
});
export type TankState = z.infer<typeof TankStateSchema>;

/** First boot: automatic, pump starts at 30 % and stops at 90 %, 10 L/min of consumption. */
export function defaultTankState(): TankState {
  return { mode: 'auto', manualPump: 'off', startLevel: 30, stopLevel: 90, samplePeriodMs: 2000, consumptionLpm: 10 };
}

/** Command payloads; limits match the tank-level manifest. */
export const TankCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_mode'), payload: z.object({ mode: z.enum(['off', 'manual', 'auto']) }).strict() }),
  z.object({ type: z.literal('set_pump'), payload: z.object({ pump: z.enum(['off', 'on']) }).strict() }),
  z.object({
    type: z.literal('set_levels'),
    payload: z.object({ startLevel: z.number().min(5).max(90), stopLevel: z.number().min(10).max(100) }).partial().strict(),
  }),
  z.object({
    type: z.literal('set_simulation'),
    payload: z.object({ consumptionLpm: z.number().min(0).max(60) }).partial().strict(),
  }),
]);

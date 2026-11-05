import type { TelemetryValue } from '@integralo/contract';
import {
  ControlParams,
  ControlParamsSchema,
  Mode,
  ModeSchema,
  SimulationConfig,
  SimulationConfigSchema,
  defaultControlParams,
} from '@integralo/module-temperature';
import { z } from 'zod';

/** Everything the node must remember across power cuts (requirement RF-24). */
export interface NodeState {
  mode: Mode;
  setpoint: number;
  manualOutput: number;
  params: ControlParams;
  simulation: SimulationConfig;
}

export const NodeStateSchema = z.object({
  mode: ModeSchema,
  setpoint: z.number(),
  manualOutput: z.number().min(0).max(100),
  params: ControlParamsSchema,
  simulation: SimulationConfigSchema,
});

/** First boot: AC off, setpoint 24 °C, constant outdoor temperature of 32 °C. */
export function defaultNodeState(): NodeState {
  return {
    mode: 'off',
    setpoint: 24,
    manualOutput: 0,
    params: defaultControlParams(),
    simulation: { disturbance: 'off', outdoorBaseC: 32, amplitudeC: 4 },
  };
}

/** Flat view of the state, used as the "state" field of an accepted ack. */
export function stateSnapshot(state: NodeState): Record<string, TelemetryValue> {
  return {
    mode: state.mode,
    setpoint: state.setpoint,
    manualOutput: state.manualOutput,
    ...state.params,
    ...state.simulation,
  };
}

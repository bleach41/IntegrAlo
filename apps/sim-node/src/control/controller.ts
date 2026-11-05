import type { NodeState } from '../node/state';
import { HysteresisController } from './hysteresis';
import { PiController } from './pi';

/**
 * Selects the output according to the mode:
 * - off:    0 %
 * - manual: output fixed from the platform (tests and maintenance)
 * - auto:   closed loop with the configured algorithm
 * Internal states are reset when the mode or the algorithm changes, so the new
 * strategy starts from a clean state.
 */
export class TemperatureController {
  private readonly hysteresis = new HysteresisController();
  private readonly pi = new PiController();
  private lastStrategy = '';

  compute(state: NodeState, temperatureC: number, dtS: number): number {
    const strategy = state.mode === 'auto' ? `auto:${state.params.algorithm}` : state.mode;
    if (strategy !== this.lastStrategy) {
      this.hysteresis.reset();
      this.pi.reset();
      this.lastStrategy = strategy;
    }

    switch (state.mode) {
      case 'off':
        return 0;
      case 'manual':
        return state.manualOutput;
      default: {
        const { algorithm, hysteresis, kp, ki } = state.params;
        return algorithm === 'pi'
          ? this.pi.compute(temperatureC, state.setpoint, kp, ki, dtS)
          : this.hysteresis.compute(temperatureC, state.setpoint, hysteresis);
      }
    }
  }
}

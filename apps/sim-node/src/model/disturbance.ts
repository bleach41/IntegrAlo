import type { SimulationConfig } from '@integralo/module-temperature';

const DAY_S = 86_400;
/** Hour of the day (simulated) with the highest outdoor temperature in the daily profile. */
const PEAK_HOUR = 15;

/**
 * Outdoor temperature seen by the room model.
 * - off:   constant base temperature
 * - step:  base + amplitude, from the moment the mode is activated
 * - daily: sinusoid around the base with a 24 h period and its maximum at 15:00
 */
export function outdoorTemperature(config: SimulationConfig, simTimeOfDayS: number): number {
  switch (config.disturbance) {
    case 'off':
      return config.outdoorBaseC;
    case 'step':
      return config.outdoorBaseC + config.amplitudeC;
    case 'daily': {
      const phase = (2 * Math.PI * (simTimeOfDayS - PEAK_HOUR * 3600)) / DAY_S;
      return config.outdoorBaseC + config.amplitudeC * Math.cos(phase);
    }
  }
}

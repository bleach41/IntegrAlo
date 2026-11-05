export interface HysteresisSettings {
  hysteresisC: number;
  /** Once started, the compressor runs at least this long (anti short-cycling). */
  minOnTimeS: number;
  /** Once stopped, the compressor stays off at least this long (anti short-cycling). */
  minOffTimeS: number;
}

/**
 * On/off control with hysteresis for cooling, as in a conventional (non-inverter) AC.
 * The compressor starts above setpoint + h and stops below setpoint − h;
 * inside the band it keeps its previous state, which avoids rapid switching.
 * Minimum on/off times protect the compressor: a change requested by the band is
 * delayed until the current state has lasted long enough.
 */
export class HysteresisController {
  private on = false;
  /** Starts satisfied, so the first start is not delayed. */
  private timeInStateS = Number.POSITIVE_INFINITY;

  get isOn(): boolean {
    return this.on;
  }

  compute(temperatureC: number, setpointC: number, settings: HysteresisSettings, dtS: number): number {
    this.timeInStateS += dtS;

    let wanted = this.on;
    if (temperatureC >= setpointC + settings.hysteresisC) {
      wanted = true;
    } else if (temperatureC <= setpointC - settings.hysteresisC) {
      wanted = false;
    }

    const minTime = this.on ? settings.minOnTimeS : settings.minOffTimeS;
    if (wanted !== this.on && this.timeInStateS >= minTime) {
      this.on = wanted;
      this.timeInStateS = 0;
    }
    return this.on ? 100 : 0;
  }

  reset(): void {
    this.on = false;
    this.timeInStateS = Number.POSITIVE_INFINITY;
  }
}

/**
 * Discrete PI controller for cooling, as in an inverter AC with variable power.
 *
 *   e = T − setpoint   (positive error: the room is too hot, more cooling is needed)
 *   u = kp · e + ki · ∫e dt, limited to 0–100 %
 *
 * Anti-windup by conditional integration: while the output is saturated, the integral
 * only changes if the error pushes the output back out of saturation.
 */
export class PiController {
  private integral = 0;

  get integralState(): number {
    return this.integral;
  }

  compute(temperatureC: number, setpointC: number, kp: number, ki: number, dtS: number): number {
    const error = temperatureC - setpointC;
    const candidate = this.integral + error * dtS;
    const unsaturated = kp * error + ki * candidate;

    const saturatedHigh = unsaturated > 100;
    const saturatedLow = unsaturated < 0;
    if ((!saturatedHigh && !saturatedLow) || (saturatedHigh && error < 0) || (saturatedLow && error > 0)) {
      this.integral = candidate;
    }

    return clamp(kp * error + ki * this.integral, 0, 100);
  }

  reset(): void {
    this.integral = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

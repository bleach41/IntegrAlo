/**
 * Discrete PI controller for cooling, as in an inverter AC with variable power.
 *
 *   e = T − setpoint   (positive error: the room is too hot, more cooling is needed)
 *   u = kp · e + I,    I = ∫ ki · e dt,   u limited to 0–100 %
 *
 * The integral term I is kept in output units (%), not as ∫e: retuning the gains while the
 * loop runs does not make the output jump (bumpless parameter change, as industrial
 * controllers do). Storing ∫e instead, a lower ki would scale the accumulated term down at
 * once (e.g. ki 0.2 → 0.02 took the output from 68 % to 7 % and the room warmed up by
 * about 1.7 °C before the loop recovered). With constant gains both forms give exactly
 * the same output.
 * - ki change: I is unchanged, so the output is too; the new ki only sets how fast I moves.
 * - kp change: I absorbs the difference of the proportional term at that instant, so the
 *   output is continuous; from then on the new kp acts on the error.
 *
 * Anti-windup by conditional integration: while the output is saturated, the integral
 * only changes if the error pushes the output back out of saturation.
 */
export class PiController {
  private integral = 0;
  private lastKp: number | undefined;

  /** Integral term I, in % of output. */
  get integralState(): number {
    return this.integral;
  }

  compute(temperatureC: number, setpointC: number, kp: number, ki: number, dtS: number): number {
    const error = temperatureC - setpointC;
    if (this.lastKp !== undefined && kp !== this.lastKp) {
      this.integral += (this.lastKp - kp) * error;
    }
    this.lastKp = kp;

    const candidate = this.integral + ki * error * dtS;
    const unsaturated = kp * error + candidate;

    const saturatedHigh = unsaturated > 100;
    const saturatedLow = unsaturated < 0;
    if ((!saturatedHigh && !saturatedLow) || (saturatedHigh && error < 0) || (saturatedLow && error > 0)) {
      this.integral = candidate;
    }

    return clamp(kp * error + this.integral, 0, 100);
  }

  reset(): void {
    this.integral = 0;
    this.lastKp = undefined;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

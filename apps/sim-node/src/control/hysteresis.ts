/**
 * On/off control with hysteresis for cooling, as in a conventional (non-inverter) AC.
 * The compressor starts above setpoint + h and stops below setpoint − h;
 * inside the band it keeps its previous state, which avoids rapid switching.
 */
export class HysteresisController {
  private on = false;

  get isOn(): boolean {
    return this.on;
  }

  compute(temperatureC: number, setpointC: number, hysteresisC: number): number {
    if (temperatureC >= setpointC + hysteresisC) {
      this.on = true;
    } else if (temperatureC <= setpointC - hysteresisC) {
      this.on = false;
    }
    return this.on ? 100 : 0;
  }

  reset(): void {
    this.on = false;
  }
}

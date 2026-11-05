/**
 * Water tank (cistern or elevated tank) mass balance:
 *
 *   dV/dt = Qp · pump − Qc        with 0 ≤ V ≤ Vmax
 *
 * V: volume (L), Qp: pump flow when on (L/min), Qc: house consumption (L/min).
 * Level is V/Vmax in %. Parameters are typical of a household 1 m³ tank and a small pump.
 */
export interface TankParams {
  capacityL: number;
  pumpFlowLpm: number;
}

export const DEFAULT_TANK: TankParams = {
  capacityL: 1000,
  pumpFlowLpm: 40,
};

export class TankModel {
  private volume: number;

  constructor(
    private readonly params: TankParams,
    initialLevelPct: number,
  ) {
    this.volume = (initialLevelPct / 100) * params.capacityL;
  }

  get volumeL(): number {
    return this.volume;
  }

  get levelPct(): number {
    return (this.volume / this.params.capacityL) * 100;
  }

  /** Advances dtS seconds with the pump state and consumption constant. */
  step(dtS: number, pumpOn: boolean, consumptionLpm: number): void {
    const netLpm = (pumpOn ? this.params.pumpFlowLpm : 0) - consumptionLpm;
    this.volume = Math.min(this.params.capacityL, Math.max(0, this.volume + (netLpm * dtS) / 60));
  }
}

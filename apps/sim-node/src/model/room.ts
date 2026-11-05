/**
 * Lumped (single-node) thermal model of a room with an air conditioner in cooling mode:
 *
 *   C · dT/dt = UA · (Tout − T) + Qint − Qac · u/100
 *
 * T: room temperature (°C), Tout: outdoor temperature (°C), u: AC output (0–100 %).
 * Time constant τ = C / UA. Parameters are provisional and must be justified in chapter 2.
 */
export interface RoomParams {
  /** Effective heat capacity of air, walls and furniture, C (J/K). */
  heatCapacityJPerK: number;
  /** Global loss coefficient through envelope and infiltration, UA (W/K). */
  lossCoefficientWPerK: number;
  /** Cooling power of the AC at 100 % output, Qac (W). */
  acCoolingPowerW: number;
  /** Internal and solar gains, Qint (W). */
  internalGainsW: number;
}

export const DEFAULT_ROOM: RoomParams = {
  heatCapacityJPerK: 500_000,
  lossCoefficientWPerK: 150,
  acCoolingPowerW: 3500, // ≈ 12 000 BTU/h
  internalGainsW: 500,
};

/** Largest explicit Euler step; τ ≈ 3300 s with the defaults, so 10 s keeps the integration accurate. */
const MAX_STEP_S = 10;

export class RoomModel {
  private t: number;

  constructor(
    private readonly params: RoomParams,
    initialTemperatureC: number,
  ) {
    this.t = initialTemperatureC;
  }

  get temperature(): number {
    return this.t;
  }

  get timeConstantS(): number {
    return this.params.heatCapacityJPerK / this.params.lossCoefficientWPerK;
  }

  /** Steady-state temperature for a constant output and outdoor temperature. */
  steadyState(outputPct: number, outdoorC: number): number {
    const { lossCoefficientWPerK: ua, internalGainsW: qint, acCoolingPowerW: qac } = this.params;
    return outdoorC + (qint - (qac * outputPct) / 100) / ua;
  }

  /** Advances the model dtS seconds with constant inputs. */
  step(dtS: number, outputPct: number, outdoorC: number): number {
    const { heatCapacityJPerK: c, lossCoefficientWPerK: ua, internalGainsW: qint, acCoolingPowerW: qac } = this.params;
    const u = Math.min(100, Math.max(0, outputPct)) / 100;
    const substeps = Math.max(1, Math.ceil(dtS / MAX_STEP_S));
    const h = dtS / substeps;
    for (let i = 0; i < substeps; i++) {
      const heatFlowW = ua * (outdoorC - this.t) + qint - qac * u;
      this.t += (heatFlowW / c) * h;
    }
    return this.t;
  }
}

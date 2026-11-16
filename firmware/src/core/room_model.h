#pragma once
// Lumped thermal model of a room cooled by an AC (same as apps/sim-node/src/model/room.ts):
//
//   C · dT/dt = UA · (Tout − T) + Qint − Qac · u/100
//
// On the real board the sensor replaces this model; until then the node runs it to have a
// process to control (temperature may be simulated, as agreed for the thesis).
#include <algorithm>
#include <cmath>

namespace integralo {

struct RoomParams {
  double heatCapacityJPerK = 500000;  // C
  double lossCoefficientWPerK = 150;  // UA
  double acCoolingPowerW = 3500;      // Qac, about 12 000 BTU/h
  double internalGainsW = 500;        // Qint
};

class RoomModel {
 public:
  explicit RoomModel(double initialTemperatureC, RoomParams params = RoomParams()) : params_(params), t_(initialTemperatureC) {}

  double temperature() const { return t_; }
  double timeConstantS() const { return params_.heatCapacityJPerK / params_.lossCoefficientWPerK; }

  /** Steady-state temperature for a constant output and outdoor temperature. */
  double steadyState(double outputPct, double outdoorC) const {
    return outdoorC + (params_.internalGainsW - params_.acCoolingPowerW * outputPct / 100) / params_.lossCoefficientWPerK;
  }

  /** Advances dtS seconds with constant inputs (explicit Euler, steps of at most 10 s; τ ≈ 3300 s). */
  double step(double dtS, double outputPct, double outdoorC) {
    const double u = std::min(100.0, std::max(0.0, outputPct)) / 100;
    const int substeps = std::max(1, static_cast<int>(std::ceil(dtS / MAX_STEP_S)));
    const double h = dtS / substeps;
    for (int i = 0; i < substeps; i++) {
      const double heatFlowW = params_.lossCoefficientWPerK * (outdoorC - t_) + params_.internalGainsW - params_.acCoolingPowerW * u;
      t_ += heatFlowW / params_.heatCapacityJPerK * h;
    }
    return t_;
  }

 private:
  static constexpr double MAX_STEP_S = 10;
  RoomParams params_;
  double t_;
};

}  // namespace integralo

#pragma once
// Control algorithms of the temperature module (same as apps/sim-node/src/control).
#include <algorithm>
#include <limits>

namespace integralo {

/**
 * On/off control with hysteresis for cooling (conventional AC).
 * Starts above setpoint + h, stops below setpoint − h, keeps its state inside the band.
 * Minimum on/off times protect the compressor (anti short-cycling).
 */
class HysteresisController {
 public:
  double compute(double temperatureC, double setpointC, double hysteresisC, double minOnTimeS, double minOffTimeS, double dtS) {
    timeInStateS_ += dtS;
    bool wanted = on_;
    if (temperatureC >= setpointC + hysteresisC) {
      wanted = true;
    } else if (temperatureC <= setpointC - hysteresisC) {
      wanted = false;
    }
    const double minTime = on_ ? minOnTimeS : minOffTimeS;
    if (wanted != on_ && timeInStateS_ >= minTime) {
      on_ = wanted;
      timeInStateS_ = 0;
    }
    return on_ ? 100 : 0;
  }

  void reset() {
    on_ = false;
    timeInStateS_ = std::numeric_limits<double>::infinity();  // the first start is not delayed
  }

  bool isOn() const { return on_; }

 private:
  bool on_ = false;
  double timeInStateS_ = std::numeric_limits<double>::infinity();
};

/**
 * Discrete PI for cooling (inverter AC): e = T − SP, u = kp·e + I, I = ∫ki·e·dt, u in 0–100 %.
 * The integral term is kept in % (not as ∫e), so retuning kp or ki while running does not make
 * the output jump (bumpless parameter change). Anti-windup by conditional integration.
 */
class PiController {
 public:
  double compute(double temperatureC, double setpointC, double kp, double ki, double dtS) {
    const double error = temperatureC - setpointC;
    if (hasLastKp_ && kp != lastKp_) {
      integral_ += (lastKp_ - kp) * error;  // keeps kp·e + I continuous
    }
    lastKp_ = kp;
    hasLastKp_ = true;

    const double candidate = integral_ + ki * error * dtS;
    const double unsaturated = kp * error + candidate;
    const bool high = unsaturated > 100;
    const bool low = unsaturated < 0;
    if ((!high && !low) || (high && error < 0) || (low && error > 0)) {
      integral_ = candidate;
    }
    return std::min(100.0, std::max(0.0, kp * error + integral_));
  }

  void reset() {
    integral_ = 0;
    hasLastKp_ = false;
  }

  double integralState() const { return integral_; }

 private:
  double integral_ = 0;
  double lastKp_ = 0;
  bool hasLastKp_ = false;
};

}  // namespace integralo

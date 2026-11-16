#pragma once
// Temperature module of the node: simulated room, controller and commands
// (apps/sim-node/src/node/simulation.ts, controller.ts and temperature-behaviour.ts).
#include <cmath>
#include <cstdio>
#include <string>

#include "command_handler.h"
#include "controllers.h"
#include "node_behaviour.h"
#include "platform.h"
#include "room_model.h"

namespace integralo {

/** JavaScript's Math.round(x·10^d)/10^d, so the readings match the simulated node exactly. */
inline double roundTo(double x, int decimals) {
  const double f = std::pow(10.0, decimals);
  return std::floor(x * f + 0.5) / f;
}

/** Outdoor temperature seen by the room: constant, a step, or a daily sinusoid peaking at 15:00. */
inline double outdoorTemperature(const SimulationConfig& c, double simTimeOfDayS) {
  if (c.disturbance == "step") return c.outdoorBaseC + c.amplitudeC;
  if (c.disturbance == "daily") {
    const double pi = 3.14159265358979323846;
    const double phase = 2 * pi * (simTimeOfDayS - 15 * 3600) / 86400;
    return c.outdoorBaseC + c.amplitudeC * std::cos(phase);
  }
  return c.outdoorBaseC;
}

/** Selects the output by mode; internal states restart when the mode or algorithm changes. */
class TemperatureController {
 public:
  double compute(const NodeState& s, double temperatureC, double dtS) {
    const std::string strategy = s.mode == "auto" ? "auto:" + s.params.algorithm : s.mode;
    if (strategy != lastStrategy_) {
      hysteresis_.reset();
      pi_.reset();
      lastStrategy_ = strategy;
    }
    if (s.mode == "off") return 0;
    if (s.mode == "manual") return s.manualOutput;
    if (s.params.algorithm == "pi") return pi_.compute(temperatureC, s.setpoint, s.params.kp, s.params.ki, dtS);
    return hysteresis_.compute(temperatureC, s.setpoint, s.params.hysteresis, s.params.minOnTimeS, s.params.minOffTimeS, dtS);
  }

 private:
  HysteresisController hysteresis_;
  PiController pi_;
  std::string lastStrategy_;
};

struct TemperatureReading {
  double temperature, setpoint, output, outdoorTemperature;
  std::string mode;
};

/** Process plus controller, without communications (also used by the offline simulate tool). */
class TemperatureSimulation {
 public:
  explicit TemperatureSimulation(double initialTemperatureC, double startTimeOfDayS = 12 * 3600)
      : room_(initialTemperatureC), simTimeS_(startTimeOfDayS) {}

  /** One control period: output from the current temperature, then the room advances dtS. */
  TemperatureReading tick(const NodeState& s, double dtS) {
    const double outdoorC = outdoorTemperature(s.simulation, std::fmod(simTimeS_, 86400.0));
    const double output = controller_.compute(s, room_.temperature(), dtS);
    room_.step(dtS, output, outdoorC);
    simTimeS_ += dtS;
    return {roundTo(room_.temperature(), 2), s.setpoint, roundTo(output, 1), roundTo(outdoorC, 2), s.mode};
  }

 private:
  RoomModel room_;
  TemperatureController controller_;
  double simTimeS_;
};

/** The temperature module as a node behaviour, with its state kept in non-volatile storage. */
class TemperatureNode : public NodeBehaviour {
 public:
  static constexpr const char* STORAGE_KEY = "temperature";

  TemperatureNode(StateStorage& storage, double initialTemperatureC)
      : storage_(storage), handler_(load(storage), [this](const NodeState& s) { storage_.save(STORAGE_KEY, stateToJson(s)); }),
        simulation_(initialTemperatureC) {}

  const char* moduleId() const override { return "temperature"; }
  uint32_t samplePeriodMs() const override { return static_cast<uint32_t>(handler_.current().params.samplePeriodMs); }
  bool handleCommand(const char* payload, size_t length, std::string& ack) override { return handler_.handle(payload, length, ack); }

  void tick(double dtS, JsonObject values) override {
    const TemperatureReading r = simulation_.tick(handler_.current(), dtS);
    values["temperature"] = r.temperature;
    values["setpoint"] = r.setpoint;
    values["output"] = r.output;
    values["mode"] = r.mode;
    values["outdoorTemperature"] = r.outdoorTemperature;
  }

  std::string describe() const override {
    char text[64];
    snprintf(text, sizeof text, "mode=%s, setpoint=%g C", handler_.current().mode.c_str(), handler_.current().setpoint);
    return text;
  }

  const NodeState& state() const { return handler_.current(); }

 private:
  /** A missing, corrupt or outdated state must not prevent the node from starting. */
  static NodeState load(StateStorage& storage) {
    NodeState s;
    std::string text;
    if (storage.load(STORAGE_KEY, text)) stateFromJson(text, s);
    return s;
  }

  StateStorage& storage_;
  CommandHandler handler_;
  TemperatureSimulation simulation_;
};

}  // namespace integralo

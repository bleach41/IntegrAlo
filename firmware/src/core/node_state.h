#pragma once
// State of the temperature node that must survive power cuts (requirement RF-24).
// Same fields, defaults and limits as modules/temperature/manifest.json and
// apps/sim-node/src/node/state.ts.
#include <string>

#include "json.h"

namespace integralo {

struct ControlParams {
  std::string algorithm = "onoff";  // onoff | pi
  double hysteresis = 0.5;          // °C, 0.1–5
  double minOnTimeS = 180;          // s, 0–1800
  double minOffTimeS = 180;         // s, 0–1800
  double kp = 20;                   // %/°C, ≥ 0
  double ki = 0.02;                 // %/(°C·s), ≥ 0
  double samplePeriodMs = 2000;     // ms, integer, 500–60000
  double setpointMin = 16;          // °C
  double setpointMax = 30;          // °C
};

/** Simulated disturbance: it configures the test bench, not the control system. */
struct SimulationConfig {
  std::string disturbance = "off";  // off | step | daily
  double outdoorBaseC = 32;         // °C, −10–50
  double amplitudeC = 4;            // °C, 0–20
};

struct NodeState {
  std::string mode = "off";  // off | manual | auto
  double setpoint = 24;
  double manualOutput = 0;  // %, 0–100
  ControlParams params;
  SimulationConfig simulation;
};

/** Persisted form (same JSON layout as the simulated node's state file). */
std::string stateToJson(const NodeState& state);
/** Returns false (and leaves `out` untouched) when the text is not a complete, valid state. */
bool stateFromJson(const std::string& text, NodeState& out);

/** Flat view of the state, used as the "state" field of an accepted ack. */
void writeStateSnapshot(const NodeState& state, JsonObject out);

/** A JSON number (booleans excluded). */
bool isJsonNumber(JsonVariantConst v);
/**
 * The value of a JSON number as the decimal that was written. ArduinoJson keeps short decimals
 * in single precision to save memory (0.05 becomes 0.049999997, 23.3 becomes 23.29999924); this
 * recovers 0.05 and 23.3, so the node reports back exactly what it was sent.
 */
double jsonNumber(JsonVariantConst v);

// Validation of single fields, shared by the command handler and the state loader.
bool isValidMode(const char* value);
bool isValidAlgorithm(const char* value);
bool isValidDisturbance(const char* value);
/** Applies one control parameter; false if the key is unknown or the value invalid. */
bool applyParam(ControlParams& params, const char* key, JsonVariantConst value);
/** Applies one simulation setting; false if the key is unknown or the value invalid. */
bool applySimulation(SimulationConfig& sim, const char* key, JsonVariantConst value);

}  // namespace integralo

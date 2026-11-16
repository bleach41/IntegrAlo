#include "node_state.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace integralo {

bool isJsonNumber(JsonVariantConst v) { return v.is<double>() && !v.is<bool>(); }

double jsonNumber(JsonVariantConst v) {
  const double x = v.as<double>();
  const float f = static_cast<float>(x);
  if (static_cast<double>(f) != x || std::isinf(x)) return x;
  // Stored in single precision: 7 significant digits give back the decimal that was written.
  char text[32];
  snprintf(text, sizeof text, "%.7g", static_cast<double>(f));
  return std::strtod(text, nullptr);
}

namespace {

bool numberIn(JsonVariantConst v, double min, double max, double& out) {
  if (!isJsonNumber(v)) return false;
  const double x = jsonNumber(v);
  if (std::isnan(x) || x < min || x > max) return false;
  out = x;
  return true;
}

constexpr double NO_LIMIT = 1e300;

bool oneOf(const char* value, const char* const* options, size_t count) {
  if (value == nullptr) return false;
  for (size_t i = 0; i < count; i++) {
    if (std::strcmp(value, options[i]) == 0) return true;
  }
  return false;
}

}  // namespace

bool isValidMode(const char* value) {
  static const char* const modes[] = {"off", "manual", "auto"};
  return oneOf(value, modes, 3);
}

bool isValidAlgorithm(const char* value) {
  static const char* const algorithms[] = {"onoff", "pi"};
  return oneOf(value, algorithms, 2);
}

bool isValidDisturbance(const char* value) {
  static const char* const disturbances[] = {"off", "step", "daily"};
  return oneOf(value, disturbances, 3);
}

bool applyParam(ControlParams& p, const char* key, JsonVariantConst v) {
  if (std::strcmp(key, "algorithm") == 0) {
    if (!v.is<const char*>() || !isValidAlgorithm(v.as<const char*>())) return false;
    p.algorithm = v.as<const char*>();
    return true;
  }
  if (std::strcmp(key, "hysteresis") == 0) return numberIn(v, 0.1, 5, p.hysteresis);
  if (std::strcmp(key, "minOnTimeS") == 0) return numberIn(v, 0, 1800, p.minOnTimeS);
  if (std::strcmp(key, "minOffTimeS") == 0) return numberIn(v, 0, 1800, p.minOffTimeS);
  if (std::strcmp(key, "kp") == 0) return numberIn(v, 0, NO_LIMIT, p.kp);
  if (std::strcmp(key, "ki") == 0) return numberIn(v, 0, NO_LIMIT, p.ki);
  if (std::strcmp(key, "samplePeriodMs") == 0) {
    double x;
    if (!numberIn(v, 500, 60000, x) || std::floor(x) != x) return false;
    p.samplePeriodMs = x;
    return true;
  }
  if (std::strcmp(key, "setpointMin") == 0) return numberIn(v, -NO_LIMIT, NO_LIMIT, p.setpointMin);
  if (std::strcmp(key, "setpointMax") == 0) return numberIn(v, -NO_LIMIT, NO_LIMIT, p.setpointMax);
  return false;
}

bool applySimulation(SimulationConfig& s, const char* key, JsonVariantConst v) {
  if (std::strcmp(key, "disturbance") == 0) {
    if (!v.is<const char*>() || !isValidDisturbance(v.as<const char*>())) return false;
    s.disturbance = v.as<const char*>();
    return true;
  }
  if (std::strcmp(key, "outdoorBaseC") == 0) return numberIn(v, -10, 50, s.outdoorBaseC);
  if (std::strcmp(key, "amplitudeC") == 0) return numberIn(v, 0, 20, s.amplitudeC);
  return false;
}

std::string stateToJson(const NodeState& s) {
  JsonDocument doc;
  doc["mode"] = s.mode;
  doc["setpoint"] = s.setpoint;
  doc["manualOutput"] = s.manualOutput;
  JsonObject p = doc["params"].to<JsonObject>();
  p["algorithm"] = s.params.algorithm;
  p["hysteresis"] = s.params.hysteresis;
  p["minOnTimeS"] = s.params.minOnTimeS;
  p["minOffTimeS"] = s.params.minOffTimeS;
  p["kp"] = s.params.kp;
  p["ki"] = s.params.ki;
  p["samplePeriodMs"] = s.params.samplePeriodMs;
  p["setpointMin"] = s.params.setpointMin;
  p["setpointMax"] = s.params.setpointMax;
  JsonObject sim = doc["simulation"].to<JsonObject>();
  sim["disturbance"] = s.simulation.disturbance;
  sim["outdoorBaseC"] = s.simulation.outdoorBaseC;
  sim["amplitudeC"] = s.simulation.amplitudeC;
  std::string out;
  serializeJsonPretty(doc, out);
  return out;
}

bool stateFromJson(const std::string& text, NodeState& out) {
  JsonDocument doc;
  if (deserializeJson(doc, text) != DeserializationError::Ok || !doc.is<JsonObject>()) return false;

  NodeState s;
  if (!doc["mode"].is<const char*>() || !isValidMode(doc["mode"].as<const char*>())) return false;
  s.mode = doc["mode"].as<const char*>();
  if (!numberIn(doc["setpoint"], -NO_LIMIT, NO_LIMIT, s.setpoint)) return false;
  if (!numberIn(doc["manualOutput"], 0, 100, s.manualOutput)) return false;

  // Every field is required, as in the simulated node's schema (an outdated file falls back to defaults).
  static const char* const paramKeys[] = {"algorithm", "hysteresis", "minOnTimeS", "minOffTimeS", "kp", "ki", "samplePeriodMs", "setpointMin", "setpointMax"};
  JsonObjectConst p = doc["params"];
  if (p.isNull()) return false;
  for (const char* key : paramKeys) {
    if (!applyParam(s.params, key, p[key])) return false;
  }
  static const char* const simKeys[] = {"disturbance", "outdoorBaseC", "amplitudeC"};
  JsonObjectConst sim = doc["simulation"];
  if (sim.isNull()) return false;
  for (const char* key : simKeys) {
    if (!applySimulation(s.simulation, key, sim[key])) return false;
  }
  out = s;
  return true;
}

void writeStateSnapshot(const NodeState& s, JsonObject o) {
  o["mode"] = s.mode;
  o["setpoint"] = s.setpoint;
  o["manualOutput"] = s.manualOutput;
  o["algorithm"] = s.params.algorithm;
  o["hysteresis"] = s.params.hysteresis;
  o["minOnTimeS"] = s.params.minOnTimeS;
  o["minOffTimeS"] = s.params.minOffTimeS;
  o["kp"] = s.params.kp;
  o["ki"] = s.params.ki;
  o["samplePeriodMs"] = s.params.samplePeriodMs;
  o["setpointMin"] = s.params.setpointMin;
  o["setpointMax"] = s.params.setpointMax;
  o["disturbance"] = s.simulation.disturbance;
  o["outdoorBaseC"] = s.simulation.outdoorBaseC;
  o["amplitudeC"] = s.simulation.amplitudeC;
}

}  // namespace integralo

#include "command_handler.h"

#include <cstring>

namespace integralo {

namespace {

std::string rejectAck(const std::string& cmdId, const char* reason) {
  JsonDocument doc;
  doc["cmdId"] = cmdId;
  doc["result"] = "rejected";
  doc["reason"] = reason;
  std::string out;
  serializeJson(doc, out);
  return out;
}

/** The payload must hold exactly one key with this name (strict schema). */
bool singleKey(JsonObjectConst payload, const char* key) {
  return payload.size() == 1 && !payload[key].isNull();
}

}  // namespace

bool CommandHandler::handle(const char* payload, size_t length, std::string& ack) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length) != DeserializationError::Ok) return false;
  const char* cmdId = doc["cmdId"].is<const char*>() ? doc["cmdId"].as<const char*>() : nullptr;
  const char* type = doc["type"].is<const char*>() ? doc["type"].as<const char*>() : nullptr;
  if (cmdId == nullptr || *cmdId == '\0' || type == nullptr || *type == '\0' || !doc["payload"].is<JsonObjectConst>()) {
    return false;
  }

  for (const auto& entry : recent_) {
    if (entry.first == cmdId) {
      ack = entry.second;
      return true;
    }
  }
  ack = apply(cmdId, type, doc["payload"].as<JsonObjectConst>());
  remember(cmdId, ack);
  return true;
}

std::string CommandHandler::apply(const std::string& cmdId, const char* type, JsonObjectConst payload) {
  NodeState next = state_;
  bool valid = true;

  if (std::strcmp(type, "set_setpoint") == 0) {
    valid = singleKey(payload, "setpoint") && isJsonNumber(payload["setpoint"]);
    if (valid) next.setpoint = jsonNumber(payload["setpoint"]);
  } else if (std::strcmp(type, "set_mode") == 0) {
    valid = singleKey(payload, "mode") && payload["mode"].is<const char*>() && isValidMode(payload["mode"].as<const char*>());
    if (valid) next.mode = payload["mode"].as<const char*>();
  } else if (std::strcmp(type, "set_output") == 0) {
    valid = singleKey(payload, "output") && isJsonNumber(payload["output"]);
    if (valid) {
      const double output = jsonNumber(payload["output"]);
      valid = output >= 0 && output <= 100;
      next.manualOutput = output;
    }
  } else if (std::strcmp(type, "set_params") == 0) {
    for (JsonPairConst kv : payload) {
      valid = valid && applyParam(next.params, kv.key().c_str(), kv.value());
    }
  } else if (std::strcmp(type, "set_simulation") == 0) {
    for (JsonPairConst kv : payload) {
      valid = valid && applySimulation(next.simulation, kv.key().c_str(), kv.value());
    }
  } else {
    return rejectAck(cmdId, "unknown_command");
  }

  if (!valid) return rejectAck(cmdId, "invalid_payload");
  if (next.params.setpointMin > next.params.setpointMax) return rejectAck(cmdId, "invalid_range");
  if (next.setpoint < next.params.setpointMin || next.setpoint > next.params.setpointMax) {
    return rejectAck(cmdId, "out_of_range");
  }

  state_ = next;
  if (onStateChange_) onStateChange_(state_);

  JsonDocument doc;
  doc["cmdId"] = cmdId;
  doc["result"] = "accepted";
  writeStateSnapshot(state_, doc["state"].to<JsonObject>());
  std::string out;
  serializeJson(doc, out);
  return out;
}

void CommandHandler::remember(const std::string& cmdId, const std::string& ack) {
  recent_.emplace_back(cmdId, ack);
  if (recent_.size() > RECENT_COMMANDS) recent_.pop_front();
}

}  // namespace integralo

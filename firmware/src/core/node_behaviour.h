#pragma once
// What a module-specific node does, separated from the MQTT skeleton (NodeApp):
// the same connection, announce, Last Will and ack handling serve every module
// (apps/sim-node/src/node/behaviour.ts).
#include <cstddef>
#include <cstdint>
#include <string>

#include "json.h"

namespace integralo {

class NodeBehaviour {
 public:
  virtual ~NodeBehaviour() = default;
  /** Module id announced to the platform; it must match a module manifest. */
  virtual const char* moduleId() const = 0;
  /** Telemetry period; a command may change it. */
  virtual uint32_t samplePeriodMs() const = 0;
  /** Applies a command and writes its ack; false only when it cannot be answered. */
  virtual bool handleCommand(const char* payload, size_t length, std::string& ack) = 0;
  /** Advances the process and the control loop dtS seconds and writes the readings. */
  virtual void tick(double dtS, JsonObject values) = 0;
  /** One-line description of the current state, for the log. */
  virtual std::string describe() const = 0;
};

}  // namespace integralo

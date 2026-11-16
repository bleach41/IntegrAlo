#pragma once
// Applies the platform's commands to the node state and builds their acks
// (same rules as apps/sim-node/src/node/command-handler.ts).
#include <cstddef>
#include <deque>
#include <functional>
#include <string>
#include <utility>

#include "node_state.h"

namespace integralo {

class CommandHandler {
 public:
  using StateListener = std::function<void(const NodeState&)>;

  CommandHandler(const NodeState& initial, StateListener onStateChange) : state_(initial), onStateChange_(std::move(onStateChange)) {}

  const NodeState& current() const { return state_; }

  /**
   * Handles one message from the cmd topic. Returns false only when it cannot be answered
   * (invalid JSON or no valid cmdId/type/payload); otherwise `ack` holds the JSON ack.
   * A repeated cmdId (QoS 1 may deliver twice) gets the same ack and is not applied again.
   */
  bool handle(const char* payload, size_t length, std::string& ack);

 private:
  static constexpr size_t RECENT_COMMANDS = 32;

  std::string apply(const std::string& cmdId, const char* type, JsonObjectConst payload);
  void remember(const std::string& cmdId, const std::string& ack);

  NodeState state_;
  StateListener onStateChange_;
  std::deque<std::pair<std::string, std::string>> recent_;
};

}  // namespace integralo

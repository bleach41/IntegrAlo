#pragma once
// Firmware skeleton, common to every module (apps/sim-node/src/node/mqtt-node.ts):
// - announces itself and its status (retained; "offline" is its Last Will)
// - keeps running the control loop while disconnected and reconnects by itself (RF-23)
// - answers every command with an ack (RF-22); the behaviour persists its state (RF-24)
// It never blocks and never reads a clock itself: the target calls loop(nowMs) often.
#include <cstdint>
#include <string>

#include "node_behaviour.h"
#include "platform.h"
#include "protocol.h"

namespace integralo {

struct NodeConfig {
  std::string nodeId;
  std::string firmwareVersion;
  std::string topicPrefix = DEFAULT_TOPIC_PREFIX;
  std::string username;
  std::string password;
  /** Simulated seconds per real second (1 on the real process). */
  double timeScale = 1;
};

class NodeApp {
 public:
  NodeApp(const NodeConfig& config, MqttTransport& mqtt, NodeBehaviour& behaviour, Logger log);

  void begin(uint64_t nowMs);
  void loop(uint64_t nowMs);
  /** Orderly stop: publishes "offline" itself instead of waiting for the Last Will. */
  void stop();

  uint32_t sequence() const { return seq_; }

 private:
  void onConnect(uint64_t nowMs);
  void onMessage(const std::string& topic, const char* payload, size_t length);
  void tick(uint64_t nowMs);
  bool publish(TopicKind kind, const std::string& payload);
  std::string topic(TopicKind kind) const { return nodeTopic(config_.topicPrefix, config_.nodeId, kind); }

  NodeConfig config_;
  MqttTransport& mqtt_;
  NodeBehaviour& behaviour_;
  Logger log_;
  uint64_t startedAtMs_ = 0;
  uint64_t nextTickMs_ = 0;
  uint64_t lastAttemptMs_ = 0;
  uint64_t lastNowMs_ = 0;
  bool attempted_ = false;
  bool wasConnected_ = false;
  uint32_t periodMs_ = 0;
  uint32_t seq_ = 0;
};

}  // namespace integralo

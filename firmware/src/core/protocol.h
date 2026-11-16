#pragma once
// MQTT contract shared with the platform (packages/contract/src/topics.ts and messages.ts).
// Topic layout: {prefix}/nodes/{nodeId}/{kind}
#include <cstdint>
#include <string>

namespace integralo {

enum class TopicKind { Announce, Status, Telemetry, Cmd, Ack };

inline const char* topicKindName(TopicKind kind) {
  switch (kind) {
    case TopicKind::Announce: return "announce";
    case TopicKind::Status: return "status";
    case TopicKind::Telemetry: return "telemetry";
    case TopicKind::Cmd: return "cmd";
    case TopicKind::Ack: return "ack";
  }
  return "";
}

/** QoS 0 only for telemetry: a lost reading is replaced by the next one. */
inline int topicQos(TopicKind kind) { return kind == TopicKind::Telemetry ? 0 : 1; }

/** Retained identity and status let the platform learn every node right after it starts. */
inline bool topicRetained(TopicKind kind) { return kind == TopicKind::Announce || kind == TopicKind::Status; }

inline std::string nodeTopic(const std::string& prefix, const std::string& nodeId, TopicKind kind) {
  return prefix + "/nodes/" + nodeId + "/" + topicKindName(kind);
}

/** Same rule as the platform: ^[a-z0-9][a-z0-9-]{2,63}$ */
inline bool isValidNodeId(const std::string& id) {
  if (id.size() < 3 || id.size() > 64) return false;
  for (size_t i = 0; i < id.size(); i++) {
    const char c = id[i];
    const bool alnum = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
    if (!alnum && !(i > 0 && c == '-')) return false;
  }
  return true;
}

constexpr const char* DEFAULT_TOPIC_PREFIX = "integralo";
constexpr uint16_t KEEPALIVE_S = 10;
constexpr uint32_t RECONNECT_PERIOD_MS = 2000;

}  // namespace integralo

#include "node_app.h"

#include <utility>

namespace integralo {

NodeApp::NodeApp(const NodeConfig& config, MqttTransport& mqtt, NodeBehaviour& behaviour, Logger log)
    : config_(config), mqtt_(mqtt), behaviour_(behaviour), log_(std::move(log)) {
  mqtt_.onMessage([this](const std::string& t, const char* p, size_t n) { onMessage(t, p, n); });
}

void NodeApp::begin(uint64_t nowMs) {
  startedAtMs_ = nowMs;
  periodMs_ = behaviour_.samplePeriodMs();
  nextTickMs_ = nowMs + periodMs_;
  log_(std::string("started (") + behaviour_.moduleId() + "), " + behaviour_.describe());
}

void NodeApp::loop(uint64_t nowMs) {
  lastNowMs_ = nowMs;
  // Connection: one attempt every RECONNECT_PERIOD_MS while the broker is unreachable.
  if (!mqtt_.connected() && (!attempted_ || nowMs - lastAttemptMs_ >= RECONNECT_PERIOD_MS)) {
    attempted_ = true;
    lastAttemptMs_ = nowMs;
    MqttConnectOptions o;
    o.clientId = config_.nodeId;
    o.username = config_.username;
    o.password = config_.password;
    o.keepaliveS = KEEPALIVE_S;
    o.willTopic = topic(TopicKind::Status);
    o.willPayload = "offline";
    o.willQos = topicQos(TopicKind::Status);
    o.willRetain = topicRetained(TopicKind::Status);
    mqtt_.connect(o);
  }
  mqtt_.loop();

  const bool connected = mqtt_.connected();
  if (connected && !wasConnected_) onConnect(nowMs);
  if (!connected && wasConnected_) log_("broker unreachable, control loop keeps running");
  wasConnected_ = connected;

  // Control loop: runs whether or not the broker is reachable.
  if (nowMs >= nextTickMs_) {
    tick(nowMs);
    nextTickMs_ += periodMs_;
    if (nowMs >= nextTickMs_) nextTickMs_ = nowMs + periodMs_;  // fell behind: do not burst
  }
}

void NodeApp::stop() {
  if (mqtt_.connected()) {
    publish(TopicKind::Status, "offline");
    mqtt_.loop();
  }
  mqtt_.disconnect();
}

void NodeApp::onConnect(uint64_t nowMs) {
  log_("connected to the broker");
  publish(TopicKind::Status, "online");
  JsonDocument doc;
  doc["nodeId"] = config_.nodeId;
  doc["module"] = behaviour_.moduleId();
  doc["fw"] = config_.firmwareVersion;
  doc["uptimeMs"] = nowMs - startedAtMs_;
  std::string announce;
  serializeJson(doc, announce);
  publish(TopicKind::Announce, announce);
  // Clean session: commands sent while the node was offline are never applied later.
  mqtt_.subscribe(topic(TopicKind::Cmd), topicQos(TopicKind::Cmd));
}

void NodeApp::onMessage(const std::string& t, const char* payload, size_t length) {
  if (t != topic(TopicKind::Cmd)) return;
  std::string ack;
  if (!behaviour_.handleCommand(payload, length, ack)) {
    log_("ignored command: invalid JSON or no valid cmdId");
    return;
  }
  publish(TopicKind::Ack, ack);
  log_("ack " + ack.substr(0, 120));
  // A command may have changed the telemetry period.
  if (behaviour_.samplePeriodMs() != periodMs_) {
    periodMs_ = behaviour_.samplePeriodMs();
    nextTickMs_ = lastNowMs_ + periodMs_;  // a full new period, as restarting a timer
  }
}

void NodeApp::tick(uint64_t nowMs) {
  const double dtS = periodMs_ / 1000.0 * config_.timeScale;
  JsonDocument doc;
  doc["seq"] = ++seq_;
  doc["uptimeMs"] = nowMs - startedAtMs_;
  behaviour_.tick(dtS, doc["values"].to<JsonObject>());
  // Readings taken while offline are not sent later; gaps in seq show the outage.
  if (mqtt_.connected()) {
    std::string telemetry;
    serializeJson(doc, telemetry);
    publish(TopicKind::Telemetry, telemetry);
  }
}

bool NodeApp::publish(TopicKind kind, const std::string& payload) {
  return mqtt_.publish(topic(kind), payload, topicQos(kind), topicRetained(kind));
}

}  // namespace integralo

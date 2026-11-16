#include "esp32_platform.h"

#include <Arduino.h>
#include <Preferences.h>
#include <mqtt_client.h>

#include "../core/protocol.h"

namespace integralo {

namespace {

const char* orNull(const std::string& s) { return s.empty() ? nullptr : s.c_str(); }

}  // namespace

EspMqttTransport::EspMqttTransport(std::string host, uint16_t port, Logger log)
    : host_(std::move(host)), port_(port), log_(std::move(log)) {}

EspMqttTransport::~EspMqttTransport() {
  if (client_ != nullptr) {
    esp_mqtt_client_stop(client_);
    esp_mqtt_client_destroy(client_);
  }
}

void EspMqttTransport::connect(const MqttConnectOptions& options) {
  // The core asks again every RECONNECT_PERIOD_MS while disconnected. esp-mqtt already
  // reconnects by itself at that period, so only the first call creates and starts the client.
  if (client_ != nullptr) return;
  options_ = options;

  esp_mqtt_client_config_t cfg = {};
  cfg.broker.address.hostname = host_.c_str();
  cfg.broker.address.port = port_;
  cfg.broker.address.transport = MQTT_TRANSPORT_OVER_TCP;
  cfg.credentials.client_id = options_.clientId.c_str();
  cfg.credentials.username = orNull(options_.username);
  cfg.credentials.authentication.password = orNull(options_.password);
  cfg.session.keepalive = options_.keepaliveS;
  cfg.session.disable_clean_session = false;  // commands sent while offline are never applied later
  cfg.session.last_will.topic = options_.willTopic.c_str();
  cfg.session.last_will.msg = options_.willPayload.c_str();
  cfg.session.last_will.msg_len = static_cast<int>(options_.willPayload.size());
  cfg.session.last_will.qos = options_.willQos;
  cfg.session.last_will.retain = options_.willRetain;
  cfg.network.reconnect_timeout_ms = RECONNECT_PERIOD_MS;
  cfg.network.timeout_ms = 5000;
  cfg.buffer.size = 2048;
  cfg.buffer.out_size = 2048;

  client_ = esp_mqtt_client_init(&cfg);
  if (client_ == nullptr) {
    report("cannot create the MQTT client (out of memory?)");
    return;
  }
  esp_mqtt_client_register_event(client_, static_cast<esp_mqtt_event_id_t>(ESP_EVENT_ANY_ID), &EspMqttTransport::onEvent, this);
  esp_mqtt_client_start(client_);
}

bool EspMqttTransport::connected() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return connected_;
}

bool EspMqttTransport::accountRefused() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return accountRefused_;
}

void EspMqttTransport::loop() {
  // Hands over, in the main task, what the MQTT task received.
  std::deque<std::pair<std::string, std::string>> inbox;
  std::string problem;
  bool isConnected;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    inbox.swap(inbox_);
    problem.swap(pendingProblem_);
    isConnected = connected_;
  }
  if (isConnected) lastProblem_.clear();  // a new failure is reported again
  if (!problem.empty()) report(problem);
  for (const auto& m : inbox) {
    if (handler_) handler_(m.first, m.second.data(), m.second.size());
  }
}

bool EspMqttTransport::publish(const std::string& topic, const std::string& payload, int qos, bool retain) {
  if (client_ == nullptr) return false;
  return esp_mqtt_client_publish(client_, topic.c_str(), payload.data(), static_cast<int>(payload.size()), qos, retain ? 1 : 0) >= 0;
}

bool EspMqttTransport::subscribe(const std::string& topic, int qos) {
  return client_ != nullptr && esp_mqtt_client_subscribe_single(client_, topic.c_str(), qos) >= 0;
}

void EspMqttTransport::disconnect() {
  if (client_ == nullptr) return;
  esp_mqtt_client_disconnect(client_);
  esp_mqtt_client_stop(client_);
  std::lock_guard<std::mutex> lock(mutex_);
  connected_ = false;
}

void EspMqttTransport::onEvent(void* self, const char*, int32_t id, void* data) {
  static_cast<EspMqttTransport*>(self)->handleEvent(id, data);
}

// Runs in the esp-mqtt task: it only copies data under the mutex, never calls the core.
void EspMqttTransport::handleEvent(int32_t id, void* data) {
  auto* event = static_cast<esp_mqtt_event_handle_t>(data);
  std::lock_guard<std::mutex> lock(mutex_);
  switch (static_cast<esp_mqtt_event_id_t>(id)) {
    case MQTT_EVENT_CONNECTED:
      connected_ = true;
      accountRefused_ = false;
      break;
    case MQTT_EVENT_DISCONNECTED:
      connected_ = false;
      break;
    case MQTT_EVENT_DATA:
      // Commands are a few hundred bytes; a message split in fragments is not a valid command.
      if (event->current_data_offset == 0 && event->data_len == event->total_data_len) {
        inbox_.emplace_back(std::string(event->topic, event->topic_len), std::string(event->data, event->data_len));
      } else {
        pendingProblem_ = "ignored a message larger than the MQTT buffer";
      }
      break;
    case MQTT_EVENT_ERROR:
      if (event->error_handle == nullptr) break;
      if (event->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
        const int rc = static_cast<int>(event->error_handle->connect_return_code);
        accountRefused_ = rc == 4 || rc == 5;
        pendingProblem_ = accountRefused_
                              ? "the broker refused the nodes' user or password, retrying"
                              : "the broker refused the connection (code " + std::to_string(rc) + "), retrying";
      } else if (event->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
        pendingProblem_ = "cannot reach the broker at " + host_ + ":" + std::to_string(port_) + " (is the server running?), retrying";
      }
      break;
    default:
      break;
  }
}

void EspMqttTransport::report(const std::string& problem) {
  // The client retries every 2 s; the same reason is printed only once.
  if (problem == lastProblem_) return;
  lastProblem_ = problem;
  if (log_) log_(problem);
}

bool NvsStorage::load(const std::string& key, std::string& value) {
  Preferences prefs;
  if (!prefs.begin(ns_, true)) return false;
  const bool found = prefs.isKey(key.c_str());
  if (found) value = prefs.getString(key.c_str()).c_str();
  prefs.end();
  return found;
}

bool NvsStorage::save(const std::string& key, const std::string& value) {
  Preferences prefs;
  if (!prefs.begin(ns_, false)) return false;
  const size_t written = prefs.putString(key.c_str(), value.c_str());
  prefs.end();
  return written == value.size();
}

Logger serialLogger(const std::string& nodeId) {
  const std::string tag = "[" + nodeId + "] ";
  return [tag](const std::string& m) { Serial.printf("%s%s\n", tag.c_str(), m.c_str()); };
}

}  // namespace integralo

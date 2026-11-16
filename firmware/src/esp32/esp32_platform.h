#pragma once
// ESP32 implementation of the platform interfaces (Arduino-ESP32 3.x, ESP-IDF 5):
// - MQTT through esp-mqtt, the client made by Espressif and included in the core. It publishes
//   with QoS 1, sends the Last Will and reconnects by itself every RECONNECT_PERIOD_MS.
// - Non-volatile memory through Preferences (NVS). NVS writes each entry completely or not at
//   all, so a power cut never leaves half a state.
#include <deque>
#include <mutex>
#include <string>
#include <utility>

#include "../core/platform.h"

struct esp_mqtt_client;

namespace integralo {

/**
 * esp-mqtt runs in its own FreeRTOS task. Its events are queued here and handed to the core
 * from loop(), in the main task, so the core keeps running single-threaded as on the PC.
 */
class EspMqttTransport : public MqttTransport {
 public:
  EspMqttTransport(std::string host, uint16_t port, Logger log);
  ~EspMqttTransport() override;

  void connect(const MqttConnectOptions& options) override;
  bool connected() const override;
  void loop() override;
  bool publish(const std::string& topic, const std::string& payload, int qos, bool retain) override;
  bool subscribe(const std::string& topic, int qos) override;
  void disconnect() override;
  void onMessage(MessageHandler handler) override { handler_ = std::move(handler); }

  /** True after the broker refused the account (CONNACK 4 or 5), until it accepts it. */
  bool accountRefused() const;

 private:
  static void onEvent(void* self, const char* base, int32_t id, void* data);
  void handleEvent(int32_t id, void* event);
  void report(const std::string& problem);

  std::string host_;
  uint16_t port_;
  Logger log_;
  MessageHandler handler_;
  esp_mqtt_client* client_ = nullptr;
  // The copies esp-mqtt points to must outlive the client.
  MqttConnectOptions options_;

  mutable std::mutex mutex_;
  bool connected_ = false;
  bool accountRefused_ = false;
  std::deque<std::pair<std::string, std::string>> inbox_;
  std::string pendingProblem_;
  std::string lastProblem_;
};

/** One Preferences namespace; each key holds one JSON document. */
class NvsStorage : public StateStorage {
 public:
  explicit NvsStorage(const char* ns) : ns_(ns) {}
  bool load(const std::string& key, std::string& value) override;
  bool save(const std::string& key, const std::string& value) override;

 private:
  const char* ns_;
};

/** Messages to the USB serial port (Serial Monitor at 115200 baud). */
Logger serialLogger(const std::string& nodeId);

}  // namespace integralo

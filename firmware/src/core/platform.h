#pragma once
// What the portable core needs from the hardware or the operating system.
// Each target implements these interfaces: src/pc (Windows, for testing without the board)
// and, when the board arrives, src/esp32 (Wi-Fi, MQTT client, Preferences/NVS).
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace integralo {

struct MqttConnectOptions {
  std::string clientId;
  std::string username;  // empty: anonymous
  std::string password;
  uint16_t keepaliveS = 10;
  std::string willTopic;
  std::string willPayload;
  int willQos = 1;
  bool willRetain = true;
};

/** MQTT client, used the way an Arduino sketch uses one: start a connection, then call loop() often. */
class MqttTransport {
 public:
  using MessageHandler = std::function<void(const std::string& topic, const char* payload, size_t length)>;
  virtual ~MqttTransport() = default;

  /** Starts a connection attempt with a clean session; connected() turns true when the broker accepts it. */
  virtual void connect(const MqttConnectOptions& options) = 0;
  virtual bool connected() const = 0;
  /** Processes network traffic; incoming messages are delivered to the handler from here. */
  virtual void loop() = 0;
  virtual bool publish(const std::string& topic, const std::string& payload, int qos, bool retain) = 0;
  virtual bool subscribe(const std::string& topic, int qos) = 0;
  virtual void disconnect() = 0;
  virtual void onMessage(MessageHandler handler) = 0;
};

/** Non-volatile key/value memory (ESP32: Preferences; PC: one file per key). */
class StateStorage {
 public:
  virtual ~StateStorage() = default;
  virtual bool load(const std::string& key, std::string& value) = 0;
  /** Must never leave a half-written value after a power cut. */
  virtual bool save(const std::string& key, const std::string& value) = 0;
};

using Logger = std::function<void(const std::string& message)>;

}  // namespace integralo

#pragma once
// PC (Windows) implementation of the platform interfaces, to run the firmware core without the
// board: MQTT through libmosquitto (installed with the Mosquitto broker) and a folder of files
// in place of the ESP32 non-volatile memory.
#include <string>
#include <utility>

#include "../core/platform.h"

struct mosquitto;
struct mosquitto_message;

namespace integralo {

class MosquittoTransport : public MqttTransport {
 public:
  MosquittoTransport(std::string host, int port);
  ~MosquittoTransport() override;

  void connect(const MqttConnectOptions& options) override;
  bool connected() const override { return connected_; }
  void loop() override;
  bool publish(const std::string& topic, const std::string& payload, int qos, bool retain) override;
  bool subscribe(const std::string& topic, int qos) override;
  void disconnect() override;
  void onMessage(MessageHandler handler) override { handler_ = std::move(handler); }

 private:
  static void onConnectCb(mosquitto*, void* self, int rc);
  static void onDisconnectCb(mosquitto*, void* self, int rc);
  static void onMessageCb(mosquitto*, void* self, const mosquitto_message* msg);

  std::string host_;
  int port_;
  mosquitto* mosq_ = nullptr;
  bool connected_ = false;
  MessageHandler handler_;
};

/** One file per key; written to a temporary file and renamed, so a power cut never leaves half a file. */
class FileStorage : public StateStorage {
 public:
  explicit FileStorage(std::string directory) : dir_(std::move(directory)) {}
  bool load(const std::string& key, std::string& value) override;
  bool save(const std::string& key, const std::string& value) override;

 private:
  std::string path(const std::string& key) const { return dir_ + "/" + key + ".json"; }
  std::string dir_;
};

}  // namespace integralo

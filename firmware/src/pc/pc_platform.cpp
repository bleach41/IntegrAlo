#include "pc_platform.h"

#include <mosquitto/libmosquitto.h>

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace integralo {

MosquittoTransport::MosquittoTransport(std::string host, int port) : host_(std::move(host)), port_(port) {
  mosquitto_lib_init();
}

MosquittoTransport::~MosquittoTransport() {
  if (mosq_ != nullptr) mosquitto_destroy(mosq_);
  mosquitto_lib_cleanup();
}

void MosquittoTransport::connect(const MqttConnectOptions& o) {
  if (mosq_ == nullptr) {
    // Clean session: the broker discards commands queued while the node was offline.
    mosq_ = mosquitto_new(o.clientId.c_str(), true, this);
    if (mosq_ == nullptr) return;
    mosquitto_connect_callback_set(mosq_, &MosquittoTransport::onConnectCb);
    mosquitto_disconnect_callback_set(mosq_, &MosquittoTransport::onDisconnectCb);
    mosquitto_message_callback_set(mosq_, &MosquittoTransport::onMessageCb);
  }
  if (!o.username.empty()) mosquitto_username_pw_set(mosq_, o.username.c_str(), o.password.c_str());
  mosquitto_will_set(mosq_, o.willTopic.c_str(), static_cast<int>(o.willPayload.size()), o.willPayload.data(), o.willQos, o.willRetain);
  // The answer (CONNACK) arrives later, inside loop(); connected() turns true then.
  mosquitto_connect(mosq_, host_.c_str(), port_, o.keepaliveS);
}

void MosquittoTransport::loop() {
  if (mosq_ == nullptr) return;
  const int rc = mosquitto_loop(mosq_, 10, 1);
  if (rc != MOSQ_ERR_SUCCESS) connected_ = false;
}

bool MosquittoTransport::publish(const std::string& topic, const std::string& payload, int qos, bool retain) {
  if (mosq_ == nullptr) return false;
  return mosquitto_publish(mosq_, nullptr, topic.c_str(), static_cast<int>(payload.size()), payload.data(), qos, retain) == MOSQ_ERR_SUCCESS;
}

bool MosquittoTransport::subscribe(const std::string& topic, int qos) {
  return mosq_ != nullptr && mosquitto_subscribe(mosq_, nullptr, topic.c_str(), qos) == MOSQ_ERR_SUCCESS;
}

void MosquittoTransport::disconnect() {
  if (mosq_ == nullptr) return;
  mosquitto_disconnect(mosq_);
  mosquitto_loop(mosq_, 50, 1);
  connected_ = false;
}

void MosquittoTransport::onConnectCb(mosquitto*, void* self, int rc) {
  static_cast<MosquittoTransport*>(self)->connected_ = (rc == 0);
}

void MosquittoTransport::onDisconnectCb(mosquitto*, void* self, int) {
  static_cast<MosquittoTransport*>(self)->connected_ = false;
}

void MosquittoTransport::onMessageCb(mosquitto*, void* self, const mosquitto_message* msg) {
  auto* t = static_cast<MosquittoTransport*>(self);
  if (t->handler_) t->handler_(msg->topic, static_cast<const char*>(msg->payload), static_cast<size_t>(msg->payloadlen));
}

bool FileStorage::load(const std::string& key, std::string& value) {
  std::ifstream in(path(key), std::ios::binary);
  if (!in) return false;
  std::ostringstream text;
  text << in.rdbuf();
  value = text.str();
  return true;
}

bool FileStorage::save(const std::string& key, const std::string& value) {
  const std::string target = path(key);
  const std::string tmp = target + ".tmp";
  {
    std::ofstream out(tmp, std::ios::binary | std::ios::trunc);
    if (!out) return false;
    out << value;
    if (!out.flush()) return false;
  }
  std::error_code ec;
  std::filesystem::rename(tmp, target, ec);  // replaces the old file in one step
  return !ec;
}

}  // namespace integralo

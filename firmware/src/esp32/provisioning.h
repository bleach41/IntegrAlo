#pragma once
// Commissioning of the ESP32 without writing anything in the code: a configuration portal.
// With no configuration (or after holding BOOT), the board opens its own Wi-Fi network
// "IntegrAlo-xxxxxx"; a phone that joins it is taken to a page where the user picks the Wi-Fi
// network and gives the server address and the nodes' MQTT account. The data is kept in NVS.
#include <cstdint>
#include <string>

namespace integralo {

struct DeviceConfig {
  std::string wifiSsid;
  std::string wifiPassword;
  std::string serverHost;
  uint16_t serverPort = 1883;
  std::string mqttUser;
  std::string mqttPassword;
  /**
   * False from the portal until the first connection to the broker. While false, a failure
   * (wrong Wi-Fi password, account refused, server not found) reopens the portal with the
   * reason. Once true, failures are only retried: after a power cut the router may take
   * longer to start than the board, and that must never send it back to the portal.
   */
  bool verified = false;

  bool complete() const { return !wifiSsid.empty() && !serverHost.empty() && !mqttUser.empty(); }
};

/** NVS namespace "integralo-cfg", separate from the control state (namespace "integralo"). */
namespace config_store {
bool load(DeviceConfig& config);
bool save(const DeviceConfig& config);
void markVerified();
/** Forgets the network configuration; the control state (setpoint, mode, gains) is kept. */
void clear();
/** Why the last attempt failed, to show it on the portal once. */
void setNotice(const std::string& notice);
std::string takeNotice();
}  // namespace config_store

/** Access point + DNS that answers every name with the board + web form (captive portal). */
class ConfigPortal {
 public:
  /** apName: "IntegrAlo-xxxxxx". notice: why the portal opened, empty on a first setup. */
  void begin(const std::string& apName, const std::string& nodeId, const DeviceConfig& current, const std::string& notice);
  void loop();
  /** True once the form was saved; the caller restarts the board. */
  bool saved() const { return saved_; }

 private:
  void scan();
  void handleRoot();
  void handleSave();
  std::string page(const std::string& body) const;
  std::string form(const std::string& error) const;

  std::string apName_;
  std::string nodeId_;
  std::string notice_;
  DeviceConfig current_;
  std::string networks_;  // <option> elements, strongest signal first
  bool saved_ = false;
};

}  // namespace integralo

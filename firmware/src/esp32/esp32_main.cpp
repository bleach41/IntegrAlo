// IntegrAlo node firmware for the ESP32 (Arduino-ESP32 3.x). The control logic is the same
// portable core that runs on the PC (src/core); this file only decides, at start-up, between the
// configuration portal and normal operation, and drives the status LED and the BOOT button.
//
// Status LED:  slow blink = configuration portal open · fast blink = connecting · on = connected
// BOOT button: held 5 s while running, forgets the Wi-Fi/server configuration and opens the portal
//              (the setpoint, mode and gains are kept).
#include <Arduino.h>
#include <WiFi.h>
#include <esp_mac.h>
#include <esp_timer.h>

#include <memory>

#include "../core/node_app.h"
#include "../core/temperature_node.h"
#include "esp32_platform.h"
#include "provisioning.h"

using namespace integralo;

namespace {

constexpr const char* FIRMWARE_VERSION = "0.1.0-esp32";
#ifdef LED_BUILTIN
constexpr int LED_PIN = LED_BUILTIN;
#else
constexpr int LED_PIN = 2;  // on-board LED of most ESP32 DevKit boards
#endif
constexpr int RESET_BUTTON_PIN = 0;  // BOOT button (GPIO0); the core calls it BOOT_PIN
constexpr uint32_t BOOT_HOLD_MS = 5000;
/** Time allowed to the first connection after the portal before reopening it with the reason. */
constexpr uint32_t WIFI_VERIFY_MS = 30000;
constexpr uint32_t BROKER_VERIFY_MS = 60000;
/** A portal opened by a failure closes after this time and the board tries again (power cuts). */
constexpr uint32_t PORTAL_RETRY_MS = 5 * 60 * 1000;
/** Initial temperature of the simulated room, as on the PC. */
constexpr double INITIAL_TEMPERATURE_C = 30;

enum class Mode { Portal, Running };

Mode mode = Mode::Running;
std::string nodeId;
DeviceConfig config;
Logger logger;
ConfigPortal portal;
bool portalAfterFailure = false;
uint64_t modeSinceMs = 0;
uint64_t bootPressedSinceMs = 0;

NvsStorage storage("integralo");
std::unique_ptr<EspMqttTransport> mqtt;
std::unique_ptr<TemperatureNode> node;
std::unique_ptr<NodeApp> app;

uint64_t nowMs() { return static_cast<uint64_t>(esp_timer_get_time() / 1000); }

/** "esp32-" + the last 6 hex digits of the Wi-Fi MAC address, fixed for each board. */
std::string makeNodeId() {
  uint8_t mac[6] = {};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char id[16];
  snprintf(id, sizeof id, "esp32-%02x%02x%02x", mac[3], mac[4], mac[5]);
  return id;
}

void setLed(bool on) { digitalWrite(LED_PIN, on ? HIGH : LOW); }

void updateLed(uint64_t now) {
  if (mode == Mode::Portal) {
    setLed((now / 1000) % 2 == 0);
  } else if (mqtt && mqtt->connected()) {
    setLed(true);
  } else {
    setLed((now / 150) % 2 == 0);
  }
}

/** Saves why the first connection failed and restarts into the portal, which shows it. */
void reopenPortal(const std::string& reason) {
  logger(reason + "; opening the configuration portal");
  config_store::setNotice(reason);
  delay(200);
  ESP.restart();
}

void startPortal(const std::string& notice) {
  mode = Mode::Portal;
  modeSinceMs = nowMs();
  const std::string apName = "IntegrAlo-" + nodeId.substr(6);
  logger("configuration portal: join the Wi-Fi network " + apName + " from a phone");
  portal.begin(apName, nodeId, config, notice);
}

void startNode() {
  mode = Mode::Running;
  modeSinceMs = nowMs();
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(nodeId.c_str());
  WiFi.setAutoReconnect(true);
  WiFi.begin(config.wifiSsid.c_str(), config.wifiPassword.c_str());
  logger("Wi-Fi " + config.wifiSsid + ", server " + config.serverHost + ":" + std::to_string(config.serverPort));

  mqtt.reset(new EspMqttTransport(config.serverHost, config.serverPort, logger));
  node.reset(new TemperatureNode(storage, INITIAL_TEMPERATURE_C));
  NodeConfig nc;
  nc.nodeId = nodeId;
  nc.firmwareVersion = FIRMWARE_VERSION;
  nc.username = config.mqttUser;
  nc.password = config.mqttPassword;
  app.reset(new NodeApp(nc, *mqtt, *node, logger));
  app->begin(nowMs());
}

/** While the configuration is new, a clear failure sends the user back to the portal with the reason. */
void verifyFirstConnection(uint64_t now) {
  if (config.verified) return;
  if (mqtt->connected()) {
    config.verified = true;
    config_store::markVerified();
    logger("configuration verified");
    return;
  }
  const uint64_t elapsed = now - modeSinceMs;
  const bool wifiUp = WiFi.status() == WL_CONNECTED;
  if (mqtt->accountRefused()) {
    reopenPortal("El servidor rechazó el usuario o la contraseña de los nodos. Cópialos otra vez del «Panel del servidor IntegrAlo».");
  } else if (!wifiUp && elapsed > WIFI_VERIFY_MS) {
    reopenPortal("No se pudo entrar en la red «" + config.wifiSsid + "». Revisa la contraseña del Wi-Fi.");
  } else if (wifiUp && elapsed > BROKER_VERIFY_MS) {
    reopenPortal("La placa entró en la red «" + config.wifiSsid + "», pero no encontró el servidor en " + config.serverHost + ":" +
                 std::to_string(config.serverPort) + ". Comprueba que el servidor esté encendido y su dirección.");
  }
}

/** BOOT held BOOT_HOLD_MS while running: forget the configuration and open the portal. */
void checkBootButton(uint64_t now) {
  if (digitalRead(RESET_BUTTON_PIN) != LOW) {
    bootPressedSinceMs = 0;
    return;
  }
  if (bootPressedSinceMs == 0) bootPressedSinceMs = now;
  if (now - bootPressedSinceMs < BOOT_HOLD_MS) return;
  logger("BOOT held: forgetting the Wi-Fi and server configuration");
  if (app) app->stop();  // publishes "offline" before leaving
  config_store::clear();
  delay(200);
  ESP.restart();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  nodeId = makeNodeId();
  logger = serialLogger(nodeId);
  logger(std::string("firmware ") + FIRMWARE_VERSION);

  const bool configured = config_store::load(config);
  const std::string notice = config_store::takeNotice();
  if (!configured) {
    startPortal("");
  } else if (!notice.empty()) {
    portalAfterFailure = true;
    startPortal(notice);
  } else {
    startNode();
  }
}

void loop() {
  const uint64_t now = nowMs();
  updateLed(now);

  if (mode == Mode::Portal) {
    portal.loop();
    if (portal.saved()) {
      delay(1500);  // lets the confirmation page reach the phone
      ESP.restart();
    }
    if (portalAfterFailure && now - modeSinceMs > PORTAL_RETRY_MS) {
      logger("nobody changed the configuration; trying again");
      ESP.restart();
    }
    delay(2);
    return;
  }

  checkBootButton(now);
  app->loop(now);  // the control loop keeps running with or without Wi-Fi
  verifyFirstConnection(now);
  delay(1);
}

#include "provisioning.h"

#include <Arduino.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

#include <algorithm>
#include <cstdlib>
#include <vector>

namespace integralo {

namespace {

constexpr const char* NS = "integralo-cfg";
const IPAddress AP_IP(192, 168, 4, 1);

WebServer server(80);
DNSServer dns;

std::string escapeHtml(const std::string& s) {
  std::string out;
  out.reserve(s.size());
  for (char c : s) {
    switch (c) {
      case '&': out += "&amp;"; break;
      case '<': out += "&lt;"; break;
      case '>': out += "&gt;"; break;
      case '"': out += "&quot;"; break;
      case '\'': out += "&#39;"; break;
      default: out += c;
    }
  }
  return out;
}

std::string arg(const char* name) {
  std::string v = server.arg(name).c_str();
  // Trim spaces a phone keyboard may add (never inside passwords).
  const auto first = v.find_first_not_of(' ');
  const auto last = v.find_last_not_of(' ');
  return first == std::string::npos ? "" : v.substr(first, last - first + 1);
}

std::string str(Preferences& p, const char* key) { return p.getString(key, "").c_str(); }

}  // namespace

namespace config_store {

bool load(DeviceConfig& c) {
  Preferences p;
  if (!p.begin(NS, true)) return false;
  c.wifiSsid = str(p, "ssid");
  c.wifiPassword = str(p, "wpass");
  c.serverHost = str(p, "host");
  c.serverPort = p.getUShort("port", 1883);
  c.mqttUser = str(p, "user");
  c.mqttPassword = str(p, "mpass");
  c.verified = p.getBool("verified", false);
  p.end();
  return c.complete();
}

bool save(const DeviceConfig& c) {
  Preferences p;
  if (!p.begin(NS, false)) return false;
  bool ok = p.putString("ssid", c.wifiSsid.c_str()) == c.wifiSsid.size();
  ok = p.putString("wpass", c.wifiPassword.c_str()) == c.wifiPassword.size() && ok;
  ok = p.putString("host", c.serverHost.c_str()) == c.serverHost.size() && ok;
  ok = p.putUShort("port", c.serverPort) > 0 && ok;
  ok = p.putString("user", c.mqttUser.c_str()) == c.mqttUser.size() && ok;
  ok = p.putString("mpass", c.mqttPassword.c_str()) == c.mqttPassword.size() && ok;
  ok = p.putBool("verified", c.verified) > 0 && ok;
  p.end();
  return ok;
}

void markVerified() {
  Preferences p;
  if (!p.begin(NS, false)) return;
  p.putBool("verified", true);
  p.end();
}

void clear() {
  Preferences p;
  if (!p.begin(NS, false)) return;
  p.clear();
  p.end();
}

void setNotice(const std::string& notice) {
  Preferences p;
  if (!p.begin(NS, false)) return;
  p.putString("notice", notice.c_str());
  p.end();
}

std::string takeNotice() {
  Preferences p;
  if (!p.begin(NS, false)) return "";
  std::string notice = str(p, "notice");
  if (!notice.empty()) p.remove("notice");
  p.end();
  return notice;
}

}  // namespace config_store

void ConfigPortal::begin(const std::string& apName, const std::string& nodeId, const DeviceConfig& current, const std::string& notice) {
  apName_ = apName;
  nodeId_ = nodeId;
  current_ = current;
  notice_ = notice;
  saved_ = false;

  // Station mode is kept on only to list the nearby networks.
  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect();
  scan();
  WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(apName_.c_str());  // open network, only while the portal is active

  // Every name resolves to the board, so the phone's captive-portal check lands on the form.
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", AP_IP);

  server.on("/", HTTP_GET, [this]() { handleRoot(); });
  server.on("/save", HTTP_POST, [this]() { handleSave(); });
  server.on("/scan", HTTP_GET, [this]() {
    scan();
    server.sendHeader("Location", "/");
    server.send(302, "text/plain", "");
  });
  server.onNotFound([]() {
    server.sendHeader("Location", "http://192.168.4.1/");
    server.send(302, "text/plain", "");
  });
  server.begin();
}

void ConfigPortal::loop() {
  dns.processNextRequest();
  server.handleClient();
}

void ConfigPortal::scan() {
  struct Net {
    std::string ssid;
    int rssi;
    bool open;
  };
  std::vector<Net> nets;
  const int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) {
    const std::string ssid = WiFi.SSID(i).c_str();
    if (ssid.empty()) continue;  // hidden network: typed by hand
    auto same = std::find_if(nets.begin(), nets.end(), [&](const Net& x) { return x.ssid == ssid; });
    if (same == nets.end()) {
      nets.push_back({ssid, WiFi.RSSI(i), WiFi.encryptionType(i) == WIFI_AUTH_OPEN});
    } else if (WiFi.RSSI(i) > same->rssi) {
      same->rssi = WiFi.RSSI(i);  // several access points with one name: keep the strongest
    }
  }
  WiFi.scanDelete();
  std::sort(nets.begin(), nets.end(), [](const Net& a, const Net& b) { return a.rssi > b.rssi; });

  networks_.clear();
  for (const Net& net : nets) {
    const char* signal = net.rssi >= -60 ? "fuerte" : net.rssi >= -75 ? "media" : "débil";
    networks_ += "<option value=\"" + escapeHtml(net.ssid) + "\"" + (net.ssid == current_.wifiSsid ? " selected" : "") + ">" +
                 escapeHtml(net.ssid) + " (señal " + signal + (net.open ? ", abierta" : "") + ")</option>";
  }
}

std::string ConfigPortal::page(const std::string& body) const {
  return "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">"
         "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>IntegrAlo</title>"
         "<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:0 auto;padding:1rem;line-height:1.4}"
         "label{display:block;margin-top:.9rem;font-weight:600}small{color:#666;font-weight:400}"
         "input,select,button{width:100%;box-sizing:border-box;font-size:1rem;padding:.6rem;margin-top:.3rem}"
         "button{margin-top:1.4rem}.msg{padding:.7rem;border:1px solid #c33;border-radius:.4rem;margin:.8rem 0}"
         "fieldset{border:1px solid #ccc;border-radius:.4rem;margin-top:1rem}</style></head><body>" +
         body + "</body></html>";
}

std::string ConfigPortal::form(const std::string& error) const {
  const bool hasWifiPass = !current_.wifiPassword.empty();
  const bool hasMqttPass = !current_.mqttPassword.empty();
  std::string b = "<h1>IntegrAlo</h1><p>Configuración del nodo <b>" + escapeHtml(nodeId_) + "</b>.</p>";
  if (!notice_.empty()) b += "<div class=\"msg\">" + escapeHtml(notice_) + "</div>";
  if (!error.empty()) b += "<div class=\"msg\">" + escapeHtml(error) + "</div>";
  b += "<form method=\"post\" action=\"/save\"><fieldset><legend>Red Wi-Fi</legend>"
       "<label>Red<select name=\"ssid\"><option value=\"\">Elige una red</option>" +
       networks_ + "</select></label><a href=\"/scan\">Buscar redes otra vez</a>"
       "<label>Otra red <small>(si no aparece en la lista)</small><input name=\"other\" autocapitalize=\"none\"></label>"
       "<label>Contraseña del Wi-Fi<input name=\"wpass\" type=\"password\"" +
       (hasWifiPass ? " placeholder=\"Sin cambios\"" : "") +
       "></label></fieldset>"
       "<fieldset><legend>Servidor IntegrAlo</legend><p><small>Los datos están en el «Panel del servidor IntegrAlo» del PC.</small></p>"
       "<label>Dirección del servidor <small>(IP del PC, p. ej. 192.168.1.10)</small><input name=\"host\" inputmode=\"url\" autocapitalize=\"none\" value=\"" +
       escapeHtml(current_.serverHost) + "\"></label><label>Puerto<input name=\"port\" inputmode=\"numeric\" value=\"" +
       std::to_string(current_.serverPort) + "\"></label><label>Usuario de los nodos<input name=\"user\" autocapitalize=\"none\" value=\"" +
       escapeHtml(current_.mqttUser) + "\"></label><label>Contraseña de los nodos<input name=\"mpass\" type=\"password\"" +
       (hasMqttPass ? " placeholder=\"Sin cambios\"" : "") + "></label></fieldset><button type=\"submit\">Guardar y conectar</button></form>";
  return page(b);
}

void ConfigPortal::handleRoot() { server.send(200, "text/html; charset=utf-8", form("").c_str()); }

void ConfigPortal::handleSave() {
  DeviceConfig next = current_;
  const std::string other = arg("other");
  next.wifiSsid = other.empty() ? arg("ssid") : other;
  const std::string wpass = server.arg("wpass").c_str();
  const std::string mpass = server.arg("mpass").c_str();
  // An empty password field keeps the saved one only for the same network or account.
  next.wifiPassword = !wpass.empty() || next.wifiSsid != current_.wifiSsid ? wpass : current_.wifiPassword;
  next.serverHost = arg("host");
  const long port = std::strtol(arg("port").c_str(), nullptr, 10);
  next.mqttUser = arg("user");
  next.mqttPassword = !mpass.empty() || next.mqttUser != current_.mqttUser ? mpass : current_.mqttPassword;
  next.verified = false;

  std::string error;
  if (next.wifiSsid.empty()) error = "Elige una red Wi-Fi o escribe su nombre.";
  else if (next.serverHost.empty()) error = "Escribe la dirección del servidor.";
  else if (port < 1 || port > 65535) error = "El puerto debe ser un número entre 1 y 65535.";
  else if (next.mqttUser.empty() || next.mqttPassword.empty()) error = "Escribe el usuario y la contraseña de los nodos.";
  if (!error.empty()) {
    server.send(200, "text/html; charset=utf-8", form(error).c_str());
    return;
  }
  next.serverPort = static_cast<uint16_t>(port);
  if (!config_store::save(next)) {
    server.send(200, "text/html; charset=utf-8", form("No se pudo guardar en la memoria de la placa. Inténtalo otra vez.").c_str());
    return;
  }
  current_ = next;
  server.send(200, "text/html; charset=utf-8",
              page("<h1>Configuración guardada</h1><p>La placa se reinicia y se conecta a la red <b>" + escapeHtml(next.wifiSsid) +
                   "</b>.</p><p>Vuelve a tu Wi-Fi de siempre y abre la app IntegrAlo: el nodo <b>" + escapeHtml(nodeId_) +
                   "</b> aparecerá en «Pendientes de aprobación».</p><p><small>Si algo falla, la red " + escapeHtml(apName_) +
                   " volverá a aparecer con el motivo.</small></p>")
                  .c_str());
  saved_ = true;
}

}  // namespace integralo

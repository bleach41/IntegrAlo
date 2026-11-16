// IntegrAlo firmware core running on a PC (software-in-the-loop), until the ESP32 arrives.
// It accepts the same options as the simulated TypeScript node (apps/sim-node), so both can be
// started and tested the same way:
//   integralo-fw-pc --time-scale 60
//   integralo-fw-pc --settings ../.data/settings.json        (broker started by the supervisor)
//   integralo-fw-pc --broker mqtt://127.0.0.1:1886 --node-id fw-e2e001 --state-dir tmp --topic-prefix integralo-e2e
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <random>
#include <sstream>
#include <string>
#include <thread>

#include "../core/node_app.h"
#include "../core/temperature_node.h"
#include "pc_platform.h"

using namespace integralo;

namespace {

constexpr const char* FIRMWARE_VERSION = "0.1.0-pc";
std::atomic<bool> stopRequested{false};

void onSignal(int) { stopRequested = true; }

uint64_t nowMs() {
  using namespace std::chrono;
  return static_cast<uint64_t>(duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count());
}

std::string readFile(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  std::ostringstream text;
  text << in.rdbuf();
  return text.str();
}

/**
 * On the ESP32 the identity comes from its fixed MAC address ("esp32-" + last 6 hex digits).
 * Here a random 6-digit id is drawn once and kept in the state folder, so the same program is
 * always recognised as the same node.
 */
std::string defaultNodeId(const std::string& stateDir) {
  const std::string file = stateDir + "/fw.identity";
  std::string saved = readFile(file);
  while (!saved.empty() && (saved.back() == '\n' || saved.back() == '\r' || saved.back() == ' ')) saved.pop_back();
  if (isValidNodeId(saved)) return saved;
  std::random_device rd;
  char id[16];
  snprintf(id, sizeof id, "fw-%06x", static_cast<unsigned>(rd() & 0xFFFFFF));
  std::ofstream(file) << id << "\n";
  return id;
}

/** mqtt://host:port → host, port */
bool parseBrokerUrl(const std::string& url, std::string& host, int& port) {
  std::string rest = url;
  const std::string scheme = "mqtt://";
  if (rest.rfind(scheme, 0) == 0) rest = rest.substr(scheme.size());
  const size_t colon = rest.rfind(':');
  host = colon == std::string::npos ? rest : rest.substr(0, colon);
  port = colon == std::string::npos ? 1883 : std::atoi(rest.c_str() + colon + 1);
  if (host == "localhost") host = "127.0.0.1";
  return !host.empty() && port > 0;
}

const char* env(const char* name, const char* fallback) {
  const char* v = std::getenv(name);
  return v != nullptr ? v : fallback;
}

}  // namespace

int main(int argc, char** argv) {
  std::string broker = env("INTEGRALO_MQTT_URL", "mqtt://localhost:1883");
  std::string nodeId = env("INTEGRALO_NODE_ID", "");
  std::string username = env("INTEGRALO_MQTT_USERNAME", "");
  std::string password = env("INTEGRALO_MQTT_PASSWORD", "");
  std::string prefix = env("INTEGRALO_TOPIC_PREFIX", DEFAULT_TOPIC_PREFIX);
  std::string stateDir = ".state-fw";
  std::string settings;
  double timeScale = 1;
  double initial = 30;

  for (int i = 1; i < argc; i++) {
    const std::string a = argv[i];
    const bool hasValue = i + 1 < argc;
    if (a == "--broker" && hasValue) broker = argv[++i];
    else if (a == "--node-id" && hasValue) nodeId = argv[++i];
    else if (a == "--username" && hasValue) username = argv[++i];
    else if (a == "--password" && hasValue) password = argv[++i];
    else if (a == "--topic-prefix" && hasValue) prefix = argv[++i];
    else if (a == "--state-dir" && hasValue) stateDir = argv[++i];
    else if (a == "--time-scale" && hasValue) timeScale = std::atof(argv[++i]);
    else if (a == "--initial" && hasValue) initial = std::atof(argv[++i]);
    else if (a == "--settings" && hasValue) settings = argv[++i];
    else if (a == "--module" && hasValue) {
      if (std::strcmp(argv[++i], "temperature") != 0) {
        fprintf(stderr, "only the temperature module is implemented in the firmware\n");
        return 1;
      }
    } else {
      fprintf(stderr, "unknown option: %s\n", a.c_str());
      return 1;
    }
  }

  if (!settings.empty()) {
    // Supervisor settings.json: broker port, topic prefix and the nodes' MQTT account.
    JsonDocument s;
    if (deserializeJson(s, readFile(settings)) != DeserializationError::Ok) {
      fprintf(stderr, "cannot read %s\n", settings.c_str());
      return 1;
    }
    broker = "mqtt://localhost:" + std::to_string(s["brokerPort"].as<int>());
    prefix = s["topicPrefix"] | prefix.c_str();
    username = s["nodes"]["username"] | "";
    password = s["nodes"]["password"] | "";
  }

  std::string host;
  int port = 0;
  if (!parseBrokerUrl(broker, host, port)) {
    fprintf(stderr, "invalid broker url: %s\n", broker.c_str());
    return 1;
  }
  std::filesystem::create_directories(stateDir);
  if (nodeId.empty()) nodeId = defaultNodeId(stateDir);
  if (!isValidNodeId(nodeId)) {
    fprintf(stderr, "invalid node id: %s\n", nodeId.c_str());
    return 1;
  }

  const std::string tag = "[" + nodeId + "] ";
  Logger log = [tag](const std::string& m) {
    printf("%s%s\n", tag.c_str(), m.c_str());
    fflush(stdout);
  };

  MosquittoTransport mqtt(host, port, log);
  FileStorage storage(stateDir + "/" + nodeId);
  std::filesystem::create_directories(stateDir + "/" + nodeId);
  TemperatureNode temperature(storage, initial);

  NodeConfig config;
  config.nodeId = nodeId;
  config.firmwareVersion = FIRMWARE_VERSION;
  config.topicPrefix = prefix;
  config.username = username;
  config.password = password;
  config.timeScale = timeScale;
  NodeApp app(config, mqtt, temperature, log);

  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);
  log("firmware " + std::string(FIRMWARE_VERSION) + ", broker " + host + ":" + std::to_string(port) + ", time scale " + std::to_string(timeScale));
  app.begin(nowMs());
  while (!stopRequested) {
    app.loop(nowMs());  // mosquitto_loop inside waits up to 10 ms for traffic
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
  }
  app.stop();
  log("stopped");
  return 0;
}

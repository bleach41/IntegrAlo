// Unit tests of the portable firmware core. They repeat the checks of the simulated TypeScript
// node (apps/sim-node/src/**/*.test.ts), so both implementations are held to the same rules.
// Build and run: firmware/scripts/build.ps1 -Test
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <map>
#include <string>
#include <vector>

#include "../src/core/command_handler.h"
#include "../src/core/controllers.h"
#include "../src/core/room_model.h"
#include "../src/core/temperature_node.h"

using namespace integralo;

namespace {

int failures = 0;
int checks = 0;
std::string current;

void check(bool ok, const std::string& what) {
  checks++;
  if (!ok) {
    failures++;
    printf("  FAIL  %s: %s\n", current.c_str(), what.c_str());
  }
}

bool near(double a, double b, double tol = 1e-9) { return std::fabs(a - b) < tol; }

void test(const char* name, const std::function<void()>& body) {
  current = name;
  const int before = failures;
  body();
  printf("%s  %s\n", failures == before ? "ok  " : "FAIL", name);
}

/** Parses an ack produced by the handler. */
JsonDocument parse(const std::string& text) {
  JsonDocument doc;
  deserializeJson(doc, text);
  return doc;
}

struct Harness {
  int changes = 0;
  CommandHandler handler{NodeState(), [this](const NodeState&) { changes++; }};
  /** Sends a command; returns "" when the handler cannot answer it. */
  std::string send(const std::string& json) {
    std::string ack;
    return handler.handle(json.data(), json.size(), ack) ? ack : "";
  }
};

std::vector<double> runClosedLoop(const NodeState& s, double hours, double dtS = 2) {
  TemperatureSimulation sim(30);
  std::vector<double> samples;
  const int steps = static_cast<int>(hours * 3600 / dtS);
  for (int i = 0; i < steps; i++) samples.push_back(sim.tick(s, dtS).temperature);
  return samples;
}

/** In-memory storage, to check persistence without files. */
class MemoryStorage : public StateStorage {
 public:
  bool load(const std::string& key, std::string& value) override {
    auto it = data.find(key);
    if (it == data.end()) return false;
    value = it->second;
    return true;
  }
  bool save(const std::string& key, const std::string& value) override {
    data[key] = value;
    return true;
  }
  std::map<std::string, std::string> data;
};

}  // namespace

int main() {
  // ---- control algorithms (control.test.ts)
  test("hysteresis starts above the band, stops below it and holds inside it", [] {
    HysteresisController c;
    check(c.compute(24.4, 24, 0.5, 0, 0, 2) == 0, "inside the band, initially off");
    check(c.compute(24.5, 24, 0.5, 0, 0, 2) == 100, "upper limit reached");
    check(c.compute(24.0, 24, 0.5, 0, 0, 2) == 100, "inside the band, keeps cooling");
    check(c.compute(23.5, 24, 0.5, 0, 0, 2) == 0, "lower limit reached");
    check(c.compute(24.0, 24, 0.5, 0, 0, 2) == 0, "inside the band, stays off");
  });

  test("minimum on time delays the stop until the compressor has run long enough", [] {
    HysteresisController c;
    check(c.compute(25, 24, 0.5, 180, 180, 2) == 100, "first start is not delayed");
    check(c.compute(23, 24, 0.5, 180, 180, 100) == 100, "100 s on: must keep running");
    check(c.compute(23, 24, 0.5, 180, 180, 80) == 0, "180 s on: may stop");
    check(c.compute(25, 24, 0.5, 180, 180, 100) == 0, "100 s off: must stay off");
    check(c.compute(25, 24, 0.5, 180, 180, 80) == 100, "180 s off: may start");
  });

  test("PI output is limited to 0-100 %", [] {
    PiController c;
    check(c.compute(40, 24, 20, 0.02, 2) == 100, "upper limit");
    c.reset();
    check(c.compute(10, 24, 20, 0.02, 2) == 0, "lower limit");
  });

  test("PI anti-windup: the integral does not grow while saturated", [] {
    PiController c;
    for (int i = 0; i < 1000; i++) c.compute(40, 24, 20, 0.02, 2);
    check(c.integralState() == 0, "integral stays at 0");
  });

  test("PI with zero error keeps the integral term as output", [] {
    PiController c;
    c.compute(25, 24, 20, 0.02, 10);
    check(near(c.compute(24, 24, 20, 0.02, 10), 0.2), "u = integral term = 0.2 %");
  });

  test("PI bumpless retuning: changing ki at steady state keeps the output", [] {
    PiController c;
    c.compute(25, 24, 20, 0.2, 120);
    const double before = c.compute(24, 24, 20, 0.2, 120);
    const double after = c.compute(24, 24, 20, 0.02, 120);
    check(before > 0, "integral term built up");
    check(near(after, before), "no jump when ki changes");
  });

  test("PI bumpless retuning: changing kp keeps the output continuous", [] {
    PiController c;
    c.compute(24.5, 24, 20, 0.02, 2);
    const double before = c.compute(24.5, 24, 20, 0, 2);
    const double after = c.compute(24.5, 24, 40, 0, 2);
    check(near(after, before), "no jump when kp changes");
  });

  // ---- room model (room.test.ts)
  test("with the AC off the room converges to Tout + Qint/UA", [] {
    RoomModel room(24);
    const double expected = room.steadyState(0, 32);
    room.step(10 * room.timeConstantS(), 0, 32);
    check(std::fabs(room.temperature() - expected) < 0.01, "steady state 35.33 C");
  });

  test("after one time constant the response reaches about 63 % of the change", [] {
    RoomModel room(24);
    const double final = room.steadyState(0, 32);
    room.step(room.timeConstantS(), 0, 32);
    check(std::fabs((room.temperature() - 24) / (final - 24) - 0.632) < 0.01, "63.2 %");
  });

  test("full cooling lowers the temperature; output outside 0-100 % is limited", [] {
    RoomModel a(30), b(30);
    a.step(600, 150, 32);
    b.step(600, 100, 32);
    check(b.temperature() < 30, "cools down");
    check(a.temperature() == b.temperature(), "150 % acts as 100 %");
  });

  // ---- commands (command-handler.test.ts)
  test("a valid setpoint is accepted and reported in the ack state", [] {
    Harness h;
    JsonDocument ack = parse(h.send(R"({"cmdId":"c-1","type":"set_setpoint","payload":{"setpoint":23.5}})"));
    check(ack["result"] == "accepted", "accepted");
    check(ack["state"]["setpoint"].as<double>() == 23.5, "state carries the new setpoint");
    check(ack["state"]["kp"].as<double>() == 20 && ack["state"]["disturbance"] == "off", "state carries the full state");
    check(h.changes == 1, "state saved once");
  });

  test("decimals sent by the platform are kept exactly (no single-precision residue)", [] {
    Harness h;
    const std::string ack = h.send(R"({"cmdId":"d-1","type":"set_setpoint","payload":{"setpoint":23.3}})");
    check(h.handler.current().setpoint == 23.3, "setpoint is exactly 23.3");
    check(ack.find("\"setpoint\":23.3,") != std::string::npos, "ack reports 23.3, not 23.29999924");
    h.send(R"({"cmdId":"d-2","type":"set_params","payload":{"ki":0.02,"kp":12.7}})");
    check(h.handler.current().params.ki == 0.02 && h.handler.current().params.kp == 12.7, "ki and kp exact");
  });

  test("a setpoint outside 16-30 C is rejected and not applied", [] {
    Harness h;
    check(h.send(R"({"cmdId":"c-1","type":"set_setpoint","payload":{"setpoint":80}})") ==
              R"({"cmdId":"c-1","result":"rejected","reason":"out_of_range"})",
          "exact rejection ack");
    check(h.handler.current().setpoint == 24 && h.changes == 0, "not applied");
  });

  test("a duplicated cmdId returns the same ack without applying it again", [] {
    Harness h;
    const std::string msg = R"({"cmdId":"c-7","type":"set_mode","payload":{"mode":"auto"}})";
    const std::string first = h.send(msg);
    const std::string second = h.send(R"({"cmdId":"c-7","type":"set_mode","payload":{"mode":"off"}})");
    check(!first.empty() && first == second, "same ack");
    check(h.changes == 1 && h.handler.current().mode == "auto", "applied once");
  });

  test("unknown commands and invalid payloads are rejected with their reason", [] {
    Harness h;
    check(parse(h.send(R"({"cmdId":"a","type":"reboot","payload":{}})"))["reason"] == "unknown_command", "unknown_command");
    check(parse(h.send(R"({"cmdId":"b","type":"set_mode","payload":{"mode":"turbo"}})"))["reason"] == "invalid_payload", "bad mode");
    check(parse(h.send(R"({"cmdId":"c","type":"set_params","payload":{"hysteresis":50}})"))["reason"] == "invalid_payload", "hysteresis > 5");
    check(parse(h.send(R"({"cmdId":"d","type":"set_params","payload":{"samplePeriodMs":1500.5}})"))["reason"] == "invalid_payload", "non-integer period");
    check(parse(h.send(R"({"cmdId":"e","type":"set_mode","payload":{"mode":"auto","extra":1}})"))["reason"] == "invalid_payload", "extra key");
    check(parse(h.send(R"({"cmdId":"f","type":"set_output","payload":{"output":true}})"))["reason"] == "invalid_payload", "boolean is not a number");
    check(parse(h.send(R"({"cmdId":"g","type":"set_simulation","payload":{"disturbance":"step","amplitudeC":3}})"))["result"] == "accepted", "partial simulation config");
    check(h.changes == 1, "only the valid command was applied");
  });

  test("a range with min > max is rejected", [] {
    Harness h;
    check(parse(h.send(R"({"cmdId":"r","type":"set_params","payload":{"setpointMin":28,"setpointMax":20}})"))["reason"] == "invalid_range", "invalid_range");
  });

  test("a message without a valid cmdId cannot be answered", [] {
    Harness h;
    check(h.send(R"({"type":"set_mode","payload":{"mode":"auto"}})").empty(), "no cmdId");
    check(h.send("not json").empty(), "invalid JSON");
    check(h.send(R"({"cmdId":"x","type":"set_mode","payload":[1]})").empty(), "payload is not an object");
  });

  // ---- persistence (RF-24)
  test("the state survives a restart and a corrupt file falls back to defaults", [] {
    MemoryStorage storage;
    {
      TemperatureNode node(storage, 30);
      std::string ack;
      const std::string cmd = R"({"cmdId":"p","type":"set_params","payload":{"algorithm":"pi","ki":0.05}})";
      node.handleCommand(cmd.data(), cmd.size(), ack);
      const std::string sp = R"({"cmdId":"q","type":"set_setpoint","payload":{"setpoint":22}})";
      node.handleCommand(sp.data(), sp.size(), ack);
    }
    TemperatureNode restarted(storage, 30);
    check(restarted.state().setpoint == 22 && restarted.state().params.algorithm == "pi" && restarted.state().params.ki == 0.05,
          "setpoint and parameters recovered");
    storage.data["temperature"] = "{\"mode\":\"auto\"";
    TemperatureNode corrupt(storage, 30);
    check(corrupt.state().mode == "off" && corrupt.state().setpoint == 24, "defaults after a corrupt file");
  });

  // ---- closed loop (simulation.test.ts)
  test("hysteresis keeps the room inside setpoint +/- h during the last hour", [] {
    NodeState s;
    s.mode = "auto";
    std::vector<double> t = runClosedLoop(s, 3);
    std::vector<double> last(t.end() - 1800, t.end());
    check(*std::max_element(last.begin(), last.end()) <= 24.55, "max within band");
    check(*std::min_element(last.begin(), last.end()) >= 23.45, "min within band");
  });

  test("PI reaches the setpoint with error below 0.1 C after 3 h", [] {
    NodeState s;
    s.mode = "auto";
    s.params.algorithm = "pi";
    check(std::fabs(runClosedLoop(s, 3).back() - 24) < 0.1, "final error < 0.1 C");
  });

  test("minimum on/off times limit compressor starts with a narrow band", [] {
    auto starts = [](double minTimeS) {
      NodeState s;
      s.mode = "auto";
      s.params.hysteresis = 0.1;
      s.params.minOnTimeS = s.params.minOffTimeS = minTimeS;
      TemperatureSimulation sim(30);
      int count = 0;
      double last = 0;
      for (int i = 0; i < 3600; i++) {
        const double output = sim.tick(s, 2).output;
        if (output > 0 && last == 0) count++;
        last = output;
      }
      return count;
    };
    const int without = starts(0), with = starts(180);
    check(with < without, "fewer starts with protection");
    check(with <= 21, "at most one start per 6 min");
  });

  test("mode off lets the room heat up", [] { check(runClosedLoop(NodeState(), 1).back() > 30, "heats up"); });

  printf("\n%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}

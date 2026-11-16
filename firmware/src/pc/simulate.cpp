// Offline closed-loop simulation with the firmware core, without MQTT. Same options and CSV as
// apps/sim-node/src/tools/simulate.ts, so the two implementations can be compared file by file.
//   integralo-fw-simulate --algorithm pi --hours 4 --csv pi.csv
#include <charconv>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <map>
#include <string>

#include "../core/temperature_node.h"

using namespace integralo;

namespace {

/** Shortest round-trip representation, as JavaScript prints numbers (23.5, 24, 120). */
std::string js(double x) {
  char buf[32];
  auto r = std::to_chars(buf, buf + sizeof buf, x);
  return std::string(buf, r.ptr);
}

}  // namespace

int main(int argc, char** argv) {
  std::map<std::string, std::string> o = {
      {"mode", "auto"}, {"output", "0"}, {"algorithm", "onoff"}, {"setpoint", "24"}, {"initial", "30"},
      {"hours", "3"},   {"disturbance", "off"}, {"from", "0"},
  };
  for (int i = 1; i + 1 < argc; i += 2) {
    std::string key = argv[i];
    if (key.rfind("--", 0) != 0) {
      fprintf(stderr, "unexpected argument %s\n", argv[i]);
      return 1;
    }
    o[key.substr(2)] = argv[i + 1];
  }
  auto num = [&](const char* k) { return std::atof(o[k].c_str()); };

  NodeState s;
  s.mode = o["mode"];
  s.manualOutput = num("output");
  s.setpoint = num("setpoint");
  s.params.algorithm = o["algorithm"];
  if (o.count("hysteresis")) s.params.hysteresis = num("hysteresis");
  if (o.count("mintime")) s.params.minOnTimeS = s.params.minOffTimeS = num("mintime");
  if (o.count("kp")) s.params.kp = num("kp");
  if (o.count("ki")) s.params.ki = num("ki");
  if (o.count("outdoor")) s.simulation.outdoorBaseC = num("outdoor");
  if (o.count("amplitude")) s.simulation.amplitudeC = num("amplitude");

  const double dtS = o.count("dt") ? num("dt") : s.params.samplePeriodMs / 1000;
  TemperatureSimulation sim(num("initial"));
  std::string csv = "time_s,temperature_c,setpoint_c,output_pct,outdoor_c";
  const long steps = static_cast<long>(num("hours") * 3600 / dtS + 0.5);
  const double fromS = num("from") * 3600;
  int starts = 0;
  double lastOutput = 0, lastTemp = num("initial");
  for (long i = 0; i < steps; i++) {
    s.simulation.disturbance = i * dtS >= fromS ? o["disturbance"] : "off";
    const TemperatureReading r = sim.tick(s, dtS);
    if (r.output > 0 && lastOutput == 0) starts++;
    lastOutput = r.output;
    lastTemp = r.temperature;
    csv += "\n" + js((i + 1) * dtS) + "," + js(r.temperature) + "," + js(r.setpoint) + "," + js(r.output) + "," + js(r.outdoorTemperature);
  }
  if (o.count("csv")) std::ofstream(o["csv"], std::ios::binary) << csv;
  printf("algorithm=%s hours=%s final=%.2f C setpoint=%g C starts=%d%s\n", s.params.algorithm.c_str(), o["hours"].c_str(), lastTemp,
         s.setpoint, starts, o.count("csv") ? (" csv=" + o["csv"]).c_str() : "");
  return 0;
}

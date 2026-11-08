import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { TemperatureSimulation } from '../node/simulation';
import { NodeState, defaultNodeState } from '../node/state';

/**
 * Offline closed-loop simulation, without MQTT. Writes a CSV for analysis (e.g. in MATLAB).
 * Example: pnpm --filter @integralo/sim-node simulate -- --algorithm pi --hours 4 --csv pi.csv
 * Open loop (fixed AC output, e.g. a step response): --mode manual --output 100
 * Control period in simulated seconds (the platform node uses period × time scale): --dt 120
 * Disturbance switched on part-way, as an operator would do it: --disturbance step --from 3 (hours)
 */
const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'auto' },
    output: { type: 'string', default: '0' },
    algorithm: { type: 'string', default: 'onoff' },
    setpoint: { type: 'string', default: '24' },
    initial: { type: 'string', default: '30' },
    hours: { type: 'string', default: '3' },
    disturbance: { type: 'string', default: 'off' },
    hysteresis: { type: 'string' },
    mintime: { type: 'string' },
    kp: { type: 'string' },
    ki: { type: 'string' },
    dt: { type: 'string' },
    outdoor: { type: 'string' },
    amplitude: { type: 'string' },
    from: { type: 'string', default: '0' },
    csv: { type: 'string' },
  },
});

const base = defaultNodeState();
const state: NodeState = {
  ...base,
  mode: values.mode as NodeState['mode'],
  manualOutput: Number(values.output),
  setpoint: Number(values.setpoint),
  params: {
    ...base.params,
    algorithm: values.algorithm as NodeState['params']['algorithm'],
    ...(values.hysteresis !== undefined && { hysteresis: Number(values.hysteresis) }),
    ...(values.mintime !== undefined && { minOnTimeS: Number(values.mintime), minOffTimeS: Number(values.mintime) }),
    ...(values.kp !== undefined && { kp: Number(values.kp) }),
    ...(values.ki !== undefined && { ki: Number(values.ki) }),
  },
  simulation: {
    ...base.simulation,
    disturbance: 'off',
    ...(values.outdoor !== undefined && { outdoorBaseC: Number(values.outdoor) }),
    ...(values.amplitude !== undefined && { amplitudeC: Number(values.amplitude) }),
  },
};

const dtS = values.dt !== undefined ? Number(values.dt) : state.params.samplePeriodMs / 1000;
const sim = new TemperatureSimulation(Number(values.initial));
const rows = ['time_s,temperature_c,setpoint_c,output_pct,outdoor_c'];
let starts = 0;
let lastOutput = 0;
let lastTemp = Number(values.initial);
const steps = Math.round((Number(values.hours) * 3600) / dtS);
const disturbanceFromS = Number(values.from) * 3600;

for (let i = 0; i < steps; i++) {
  state.simulation.disturbance = i * dtS >= disturbanceFromS ? (values.disturbance as NodeState['simulation']['disturbance']) : 'off';
  const t = sim.tick(state, dtS);
  const output = t.output as number;
  if (output > 0 && lastOutput === 0) starts++;
  lastOutput = output;
  lastTemp = t.temperature as number;
  rows.push([(i + 1) * dtS, t.temperature, t.setpoint, t.output, t.outdoorTemperature].join(','));
}

if (values.csv) {
  writeFileSync(values.csv, rows.join('\n'));
}
console.log(
  `${state.mode === 'auto' ? `algorithm=${state.params.algorithm}` : `mode=${state.mode} output=${state.manualOutput} %`} hours=${values.hours} final=${lastTemp.toFixed(2)} °C ` +
    `setpoint=${state.setpoint} °C starts=${starts} (${(starts / Number(values.hours)).toFixed(1)}/h)` +
    `${values.csv ? ` csv=${values.csv}` : ''}`,
);

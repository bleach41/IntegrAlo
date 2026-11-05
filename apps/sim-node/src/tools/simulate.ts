import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { TemperatureSimulation } from '../node/simulation';
import { NodeState, defaultNodeState } from '../node/state';

/**
 * Offline closed-loop simulation, without MQTT. Writes a CSV for analysis (e.g. in MATLAB).
 * Example: pnpm --filter @integralo/sim-node simulate -- --algorithm pi --hours 4 --csv pi.csv
 */
const { values } = parseArgs({
  options: {
    algorithm: { type: 'string', default: 'onoff' },
    setpoint: { type: 'string', default: '24' },
    initial: { type: 'string', default: '30' },
    hours: { type: 'string', default: '3' },
    disturbance: { type: 'string', default: 'off' },
    hysteresis: { type: 'string' },
    mintime: { type: 'string' },
    csv: { type: 'string' },
  },
});

const base = defaultNodeState();
const state: NodeState = {
  ...base,
  mode: 'auto',
  setpoint: Number(values.setpoint),
  params: {
    ...base.params,
    algorithm: values.algorithm as NodeState['params']['algorithm'],
    ...(values.hysteresis !== undefined && { hysteresis: Number(values.hysteresis) }),
    ...(values.mintime !== undefined && { minOnTimeS: Number(values.mintime), minOffTimeS: Number(values.mintime) }),
  },
  simulation: { ...base.simulation, disturbance: values.disturbance as NodeState['simulation']['disturbance'] },
};

const dtS = state.params.samplePeriodMs / 1000;
const sim = new TemperatureSimulation(Number(values.initial));
const rows = ['time_s,temperature_c,setpoint_c,output_pct,outdoor_c'];
let starts = 0;
let lastOutput = 0;
let lastTemp = Number(values.initial);
const steps = Math.round((Number(values.hours) * 3600) / dtS);

for (let i = 0; i < steps; i++) {
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
  `algorithm=${state.params.algorithm} hours=${values.hours} final=${lastTemp.toFixed(2)} °C ` +
    `setpoint=${state.setpoint} °C starts=${starts} (${(starts / Number(values.hours)).toFixed(1)}/h)` +
    `${values.csv ? ` csv=${values.csv}` : ''}`,
);

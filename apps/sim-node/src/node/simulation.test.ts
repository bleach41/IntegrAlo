import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TemperatureSimulation } from './simulation';
import { NodeState, defaultNodeState } from './state';

function runClosedLoop(state: NodeState, hours: number, dtS = 2) {
  const sim = new TemperatureSimulation(30);
  const samples: number[] = [];
  const steps = (hours * 3600) / dtS;
  for (let i = 0; i < steps; i++) {
    samples.push(sim.tick(state, dtS).temperature as number);
  }
  return samples;
}

test('hysteresis keeps the room inside setpoint ± h during the last hour', () => {
  const state: NodeState = { ...defaultNodeState(), mode: 'auto' };
  const lastHour = runClosedLoop(state, 3).slice(-1800);
  const { setpoint } = state;
  const h = state.params.hysteresis;
  assert.ok(Math.max(...lastHour) <= setpoint + h + 0.05, `max ${Math.max(...lastHour)}`);
  assert.ok(Math.min(...lastHour) >= setpoint - h - 0.05, `min ${Math.min(...lastHour)}`);
});

test('PI reaches the setpoint with error below 0.1 °C after 3 h', () => {
  const base = defaultNodeState();
  const state: NodeState = { ...base, mode: 'auto', params: { ...base.params, algorithm: 'pi' } };
  const samples = runClosedLoop(state, 3);
  assert.ok(Math.abs(samples[samples.length - 1] - state.setpoint) < 0.1, `final ${samples[samples.length - 1]}`);
});

test('minimum on/off times limit compressor starts with a narrow band', () => {
  const base = defaultNodeState();
  const starts = (minTimeS: number) => {
    const state: NodeState = {
      ...base,
      mode: 'auto',
      params: { ...base.params, hysteresis: 0.1, minOnTimeS: minTimeS, minOffTimeS: minTimeS },
    };
    const sim = new TemperatureSimulation(30);
    let count = 0;
    let last = 0;
    for (let i = 0; i < 3600; i++) {
      const output = sim.tick(state, 2).output as number; // 2 h at 2 s
      if (output > 0 && last === 0) count++;
      last = output;
    }
    return count;
  };
  const withoutProtection = starts(0);
  const withProtection = starts(180);
  assert.ok(withProtection < withoutProtection, `${withProtection} vs ${withoutProtection}`);
  assert.ok(withProtection <= 2 * 10 + 1, `starts in 2 h: ${withProtection}`); // at most one per 6 min
});

test('mode off lets the room heat up', () => {
  const samples = runClosedLoop(defaultNodeState(), 1);
  assert.ok(samples[samples.length - 1] > 30);
});

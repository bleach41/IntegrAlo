import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HysteresisController } from './hysteresis';
import { PiController } from './pi';

const NO_MIN_TIMES = { hysteresisC: 0.5, minOnTimeS: 0, minOffTimeS: 0 };

test('hysteresis starts above the band, stops below it and holds inside it', () => {
  const c = new HysteresisController();
  assert.equal(c.compute(24.4, 24, NO_MIN_TIMES, 2), 0); // inside the band, initially off
  assert.equal(c.compute(24.5, 24, NO_MIN_TIMES, 2), 100); // upper limit reached
  assert.equal(c.compute(24.0, 24, NO_MIN_TIMES, 2), 100); // inside the band, keeps cooling
  assert.equal(c.compute(23.5, 24, NO_MIN_TIMES, 2), 0); // lower limit reached
  assert.equal(c.compute(24.0, 24, NO_MIN_TIMES, 2), 0); // inside the band, stays off
});

test('minimum on time delays the stop until the compressor has run long enough', () => {
  const c = new HysteresisController();
  const settings = { hysteresisC: 0.5, minOnTimeS: 180, minOffTimeS: 180 };
  assert.equal(c.compute(25, 24, settings, 2), 100); // first start is not delayed
  assert.equal(c.compute(23, 24, settings, 100), 100); // 100 s on: must keep running
  assert.equal(c.compute(23, 24, settings, 80), 0); // 180 s on: may stop
  assert.equal(c.compute(25, 24, settings, 100), 0); // 100 s off: must stay off
  assert.equal(c.compute(25, 24, settings, 80), 100); // 180 s off: may start
});

test('PI output is limited to 0–100 %', () => {
  const c = new PiController();
  assert.equal(c.compute(40, 24, 20, 0.02, 2), 100);
  c.reset();
  assert.equal(c.compute(10, 24, 20, 0.02, 2), 0);
});

test('PI anti-windup: the integral does not grow while saturated', () => {
  const c = new PiController();
  for (let i = 0; i < 1000; i++) {
    c.compute(40, 24, 20, 0.02, 2); // large positive error, output saturated at 100 %
  }
  assert.equal(c.integralState, 0);
});

test('PI with zero error keeps the integral term as output', () => {
  const c = new PiController();
  c.compute(25, 24, 20, 0.02, 10); // e = 1, integral = 10, u = 20 + 0.2
  const u = c.compute(24, 24, 20, 0.02, 10); // e = 0, u = ki · integral
  assert.ok(Math.abs(u - 0.2) < 1e-9);
});

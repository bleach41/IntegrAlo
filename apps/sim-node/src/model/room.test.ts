import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ROOM, RoomModel } from './room';

test('with the AC off the room converges to Tout + Qint/UA', () => {
  const room = new RoomModel(DEFAULT_ROOM, 24);
  const expected = room.steadyState(0, 32); // 32 + 500/150 ≈ 35.33 °C
  room.step(10 * room.timeConstantS, 0, 32);
  assert.ok(Math.abs(room.temperature - expected) < 0.01);
});

test('after one time constant the response reaches about 63 % of the change', () => {
  const room = new RoomModel(DEFAULT_ROOM, 24);
  const final = room.steadyState(0, 32);
  room.step(room.timeConstantS, 0, 32);
  const fraction = (room.temperature - 24) / (final - 24);
  assert.ok(Math.abs(fraction - 0.632) < 0.01, `fraction = ${fraction}`);
});

test('full cooling lowers the temperature', () => {
  const room = new RoomModel(DEFAULT_ROOM, 30);
  room.step(600, 100, 32);
  assert.ok(room.temperature < 30);
});

test('output outside 0–100 % is limited', () => {
  const a = new RoomModel(DEFAULT_ROOM, 30);
  const b = new RoomModel(DEFAULT_ROOM, 30);
  a.step(600, 150, 32);
  b.step(600, 100, 32);
  assert.equal(a.temperature, b.temperature);
});

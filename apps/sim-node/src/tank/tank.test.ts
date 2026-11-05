import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TankBehaviour } from './behaviour';
import { DEFAULT_TANK, TankModel } from './model';

function withBehaviour(initialLevel: number, run: (b: TankBehaviour) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'tank-test-'));
  try {
    run(new TankBehaviour(join(dir, 'state.json'), initialLevel));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('mass balance: 40 L/min in, 10 L/min out fills 30 L per minute', () => {
  const tank = new TankModel(DEFAULT_TANK, 50);
  tank.step(60, true, 10);
  assert.ok(Math.abs(tank.volumeL - 530) < 1e-9);
});

test('volume stays between empty and full', () => {
  const tank = new TankModel(DEFAULT_TANK, 1);
  tank.step(3600, false, 60);
  assert.equal(tank.volumeL, 0);
  tank.step(3600, true, 0);
  assert.equal(tank.volumeL, DEFAULT_TANK.capacityL);
});

test('automatic mode keeps the level between start and stop levels', () => {
  withBehaviour(50, (b) => {
    const levels: number[] = [];
    for (let i = 0; i < 6 * 3600; i += 10) levels.push(b.tick(10).level as number); // 6 h
    const lastHours = levels.slice(levels.length / 2);
    assert.ok(Math.min(...lastHours) >= 30 - 1, `min ${Math.min(...lastHours)}`);
    assert.ok(Math.max(...lastHours) <= 90 + 1, `max ${Math.max(...lastHours)}`);
  });
});

test('manual pump command and level range validation', () => {
  withBehaviour(50, (b) => {
    assert.equal(b.handleCommand({ cmdId: 'a', type: 'set_mode', payload: { mode: 'manual' } })?.result, 'accepted');
    assert.equal(b.handleCommand({ cmdId: 'b', type: 'set_pump', payload: { pump: 'on' } })?.result, 'accepted');
    assert.equal(b.tick(2).pump, 'on');
    const bad = b.handleCommand({ cmdId: 'c', type: 'set_levels', payload: { startLevel: 80, stopLevel: 60 } });
    assert.deepEqual(bad, { cmdId: 'c', result: 'rejected', reason: 'invalid_range' });
    const dup = b.handleCommand({ cmdId: 'b', type: 'set_pump', payload: { pump: 'off' } });
    assert.equal(dup?.result, 'accepted'); // duplicate: same ack, not applied again
    assert.equal(b.tick(2).pump, 'on');
  });
});

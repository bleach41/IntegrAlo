import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CommandHandler } from './command-handler';
import { NodeState, defaultNodeState } from './state';

function setup() {
  const changes: NodeState[] = [];
  const handler = new CommandHandler(defaultNodeState(), (s) => changes.push(s));
  return { handler, changes };
}

test('a valid setpoint is accepted and reported in the ack state', () => {
  const { handler, changes } = setup();
  const ack = handler.handle({ cmdId: 'c-1', type: 'set_setpoint', payload: { setpoint: 23.5 } });
  assert.deepEqual(ack && ack.result, 'accepted');
  assert.equal(ack?.result === 'accepted' && ack.state.setpoint, 23.5);
  assert.equal(changes.length, 1);
});

test('a setpoint outside 16–30 °C is rejected and not applied', () => {
  const { handler, changes } = setup();
  const ack = handler.handle({ cmdId: 'c-1', type: 'set_setpoint', payload: { setpoint: 80 } });
  assert.deepEqual(ack, { cmdId: 'c-1', result: 'rejected', reason: 'out_of_range' });
  assert.equal(handler.current.setpoint, 24);
  assert.equal(changes.length, 0);
});

test('a duplicated cmdId returns the same ack without applying it again', () => {
  const { handler, changes } = setup();
  const msg = { cmdId: 'c-7', type: 'set_mode', payload: { mode: 'auto' } };
  const first = handler.handle(msg);
  const second = handler.handle(msg);
  assert.deepEqual(second, first);
  assert.equal(changes.length, 1);
});

test('unknown commands and invalid payloads are rejected with their reason', () => {
  const { handler } = setup();
  assert.deepEqual(handler.handle({ cmdId: 'a', type: 'reboot', payload: {} }), {
    cmdId: 'a',
    result: 'rejected',
    reason: 'unknown_command',
  });
  assert.deepEqual(handler.handle({ cmdId: 'b', type: 'set_mode', payload: { mode: 'turbo' } }), {
    cmdId: 'b',
    result: 'rejected',
    reason: 'invalid_payload',
  });
  assert.deepEqual(handler.handle({ cmdId: 'c', type: 'set_params', payload: { hysteresis: 50 } }), {
    cmdId: 'c',
    result: 'rejected',
    reason: 'invalid_payload',
  });
});

test('a range with min > max is rejected', () => {
  const { handler } = setup();
  const ack = handler.handle({ cmdId: 'r', type: 'set_params', payload: { setpointMin: 28, setpointMax: 20 } });
  assert.equal(ack?.result === 'rejected' && ack.reason, 'invalid_range');
});

test('a message without a valid cmdId cannot be answered', () => {
  const { handler } = setup();
  assert.equal(handler.handle({ type: 'set_mode', payload: { mode: 'auto' } }), null);
  assert.equal(handler.handle('not json'), null);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manifest } from './manifest';

// The set_params form fields repeat the limits of the parameters they change;
// this test keeps both declarations of the manifest consistent.
test('set_params fields match the parameter limits', () => {
  const setParams = manifest.commands.find((c) => c.type === 'set_params');
  assert.ok(setParams, 'set_params is declared');
  for (const [key, field] of Object.entries(setParams.fields)) {
    const param = manifest.parameters[key];
    assert.ok(param, `parameter ${key} exists`);
    assert.equal(field.type, param.type, `${key}: same type`);
    if (field.type === 'number' && param.type === 'number') {
      assert.equal(field.min, param.min, `${key}: same min`);
      assert.equal(field.max, param.max, `${key}: same max`);
    }
    if (field.type === 'enum' && param.type === 'enum') {
      assert.deepEqual(field.values, param.values, `${key}: same values`);
    }
  }
});

test('setpoint command limits match the default setpoint range', () => {
  const field = manifest.commands.find((c) => c.type === 'set_setpoint')?.fields.setpoint;
  const min = manifest.parameters.setpointMin;
  const max = manifest.parameters.setpointMax;
  assert.ok(field?.type === 'number' && min?.type === 'number' && max?.type === 'number');
  assert.equal(field.min, min.default);
  assert.equal(field.max, max.default);
});

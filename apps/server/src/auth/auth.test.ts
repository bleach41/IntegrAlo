import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from './password';
import { grants, hasPermission } from './permissions';

test('a password verifies against its own hash only', async () => {
  const stored = await hashPassword('correct horse');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse', stored), true);
  assert.equal(await verifyPassword('correct hors', stored), false);
});

test('the same password produces different hashes (random salt)', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});

test('a malformed stored hash never verifies', async () => {
  assert.equal(await verifyPassword('x', 'plain-text'), false);
});

test('permission matching with wildcards', () => {
  assert.equal(grants('*', 'users.manage'), true);
  assert.equal(grants('nodes.read', 'nodes.read'), true);
  assert.equal(grants('nodes.read', 'nodes.approve'), false);
  assert.equal(grants('command:*:set_mode', 'command:temperature:set_mode'), true);
  assert.equal(grants('command:*:set_mode', 'command:temperature:set_params'), false);
  assert.equal(grants('command:temperature:*', 'command:tank-level:set_pump'), false);
  assert.equal(hasPermission(['nodes.read', 'command:*:set_setpoint'], 'command:temperature:set_setpoint'), true);
  assert.equal(hasPermission([], 'nodes.read'), false);
});

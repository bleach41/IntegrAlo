import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aclFile, mosquittoConfig } from './broker';
import { defaultSettings, newPassword } from './settings';

test('generated passwords are random and long enough', () => {
  const a = newPassword();
  assert.equal(a.length, 24);
  assert.notEqual(a, newPassword());
});

test('broker config denies anonymous access and listens on the configured port', () => {
  const conf = mosquittoConfig(defaultSettings({ brokerPort: 1884 }), 'C:\\data\\broker');
  assert.match(conf, /^allow_anonymous false$/m);
  assert.match(conf, /^listener 1884$/m);
  assert.match(conf, /^password_file C:\/data\/broker\/passwords$/m);
  assert.match(conf, /^acl_file C:\/data\/broker\/acl$/m);
});

test('ACL gives nodes only the nodes topics and the core the whole prefix', () => {
  const settings = defaultSettings();
  const acl = aclFile(settings);
  assert.match(acl, new RegExp(`user ${settings.core.username}\\ntopic readwrite integralo/#`));
  assert.match(acl, new RegExp(`user ${settings.nodes.username}\\ntopic readwrite integralo/nodes/#`));
  assert.ok(!acl.includes(settings.nodes.password), 'no passwords in the ACL');
});

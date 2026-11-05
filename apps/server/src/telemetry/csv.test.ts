import assert from 'node:assert/strict';
import { test } from 'node:test';
import { telemetryToCsv } from './csv';

test('CSV has a header in manifest order and one row per sample', () => {
  const csv = telemetryToCsv(
    [
      { receivedAt: 0, seq: 1, values: { temperature: 24.5, mode: 'auto' } },
      { receivedAt: 2000, seq: 2, values: { temperature: 24.4 } },
    ],
    ['temperature', 'mode'],
  );
  assert.equal(
    csv,
    'time_iso,time_ms,seq,temperature,mode\r\n' +
      '1970-01-01T00:00:00.000Z,0,1,24.5,auto\r\n' +
      '1970-01-01T00:00:02.000Z,2000,2,24.4,\r\n',
  );
});

test('text with commas or quotes is escaped', () => {
  const csv = telemetryToCsv([{ receivedAt: 0, seq: 1, values: { note: 'a,"b"' } }], ['note']);
  assert.ok(csv.includes('"a,""b"""'));
});

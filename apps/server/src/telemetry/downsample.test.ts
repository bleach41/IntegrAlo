import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TelemetrySample } from '@integralo/contract';
import { downsample } from './downsample';

const sample = (receivedAt: number, values: TelemetrySample['values']): TelemetrySample => ({ receivedAt, seq: receivedAt, values });

test('a short series is returned unchanged', () => {
  const samples = [sample(0, { t: 1 }), sample(10, { t: 2 })];
  assert.equal(downsample(samples, 0, 100, 10), samples);
});

test('numbers are averaged and states take the most frequent value per bucket', () => {
  // 0–99 ms in 2 buckets of 50 ms.
  const samples = [
    sample(0, { t: 20, mode: 'auto' }),
    sample(10, { t: 22, mode: 'auto' }),
    sample(20, { t: 24, mode: 'off' }),
    sample(60, { t: 30, mode: 'manual' }),
    sample(70, { t: 32, mode: 'manual' }),
  ];
  const result = downsample(samples, 0, 100, 2);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].values, { t: 22, mode: 'auto' });
  assert.equal(result[0].receivedAt, 10);
  assert.deepEqual(result[1].values, { t: 31, mode: 'manual' });
  assert.equal(result[1].seq, 70);
});

test('empty buckets are skipped, so gaps stay visible', () => {
  const samples = [sample(0, { t: 1 }), sample(5, { t: 1 }), sample(95, { t: 3 }), sample(99, { t: 5 })];
  const result = downsample(samples, 0, 100, 3);
  assert.deepEqual(
    result.map((s) => s.values.t),
    [1, 4],
  );
});

import type { TelemetrySample } from '@integralo/contract';

/**
 * Reduces a long series to about `points` samples for a chart: time is cut into equal buckets
 * of (to − from) / points, counted from the epoch and not from `from` (which moves with every
 * refresh, so buckets counted from it would regroup the readings and change the past of the
 * chart). Each bucket with readings becomes one sample, placed at the mean time of its readings.
 * Numbers are averaged; other values (modes, states) take the value seen most often in the
 * bucket. A short series is returned unchanged.
 *
 * Averaging hides peaks shorter than a bucket: the client says how long a bucket is, so the
 * chart is read as a trend and not as individual readings.
 */
export function downsample(samples: TelemetrySample[], from: number, to: number, points: number): TelemetrySample[] {
  if (samples.length <= points) return samples;
  const bucketMs = Math.max(1, (to - from) / points);
  const buckets = new Map<number, TelemetrySample[]>();
  for (const sample of samples) {
    const index = Math.floor(sample.receivedAt / bucketMs);
    const bucket = buckets.get(index);
    if (bucket) bucket.push(sample);
    else buckets.set(index, [sample]);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([, bucket]) => merge(bucket));
}

function merge(bucket: TelemetrySample[]): TelemetrySample {
  const sums = new Map<string, { total: number; count: number }>();
  const counts = new Map<string, Map<unknown, number>>();
  for (const sample of bucket) {
    for (const [key, value] of Object.entries(sample.values)) {
      if (typeof value === 'number') {
        const sum = sums.get(key) ?? { total: 0, count: 0 };
        sum.total += value;
        sum.count += 1;
        sums.set(key, sum);
      } else {
        const seen = counts.get(key) ?? new Map<unknown, number>();
        seen.set(value, (seen.get(value) ?? 0) + 1);
        counts.set(key, seen);
      }
    }
  }
  const values: Record<string, unknown> = {};
  for (const [key, { total, count }] of sums) values[key] = total / count;
  for (const [key, seen] of counts) values[key] = [...seen.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
  return {
    receivedAt: Math.round(bucket.reduce((acc, s) => acc + s.receivedAt, 0) / bucket.length),
    seq: bucket[bucket.length - 1].seq,
    values: values as TelemetrySample['values'],
  };
}

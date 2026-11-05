import type { TelemetrySample } from './telemetry.service';

/**
 * CSV for analysis tools (MATLAB readtable, spreadsheets): comma separator, dot as decimal
 * mark, ISO 8601 time plus Unix milliseconds, one column per variable in manifest order.
 */
export function telemetryToCsv(samples: TelemetrySample[], variables: string[]): string {
  const header = ['time_iso', 'time_ms', 'seq', ...variables];
  const lines = [header.join(',')];
  for (const s of samples) {
    const cells = [new Date(s.receivedAt).toISOString(), String(s.receivedAt), String(s.seq)];
    for (const key of variables) cells.push(cell(s.values[key]));
    lines.push(cells.join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function cell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

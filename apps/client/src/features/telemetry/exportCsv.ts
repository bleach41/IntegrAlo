import { Platform } from 'react-native';

/**
 * Downloads a node's readings between `from` and `to` as CSV (RF-13): raw readings, not the
 * averages of the long charts, with one column per variable of the manifest, ready for MATLAB
 * (`readtable`) or a spreadsheet. The server builds the file; here it is only handed over:
 * - web / desktop: saved by the browser as a download;
 * - phone: downloaded to the app cache and offered through the system share sheet (save to
 *   files, send to the computer…).
 */
export async function exportCsv(serverUrl: string, token: string, nodeId: string, from: number, to: number): Promise<void> {
  const url = `${serverUrl}/api/nodes/${encodeURIComponent(nodeId)}/telemetry/export.csv?from=${Math.floor(from)}&to=${Math.ceil(to)}`;
  const name = `${nodeId}_${fileStamp(from)}_${fileStamp(to)}.csv`;
  const headers = { authorization: `Bearer ${token}` };

  if (Platform.OS === 'web') {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    return;
  }

  // Loaded here, not at start-up: a host app without these native modules still opens.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const file = await File.downloadFileAsync(url, new File(Paths.cache, name), { headers, idempotent: true });
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: name });
}

/** 2026-11-07T14-30 (local time; no characters that file systems refuse). */
function fileStamp(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}-${two(d.getMinutes())}`;
}

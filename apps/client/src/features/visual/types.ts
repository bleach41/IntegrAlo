import type { AlarmRecord, ModuleManifest, NodeInfo, TelemetrySample } from '@integralo/contract';
import type { AlarmConfig } from '@/api/queries';

/** Everything a module's synoptic needs: live values, its thresholds and its open alarms. */
export interface VisualProps {
  node: NodeInfo;
  manifest: ModuleManifest;
  sample: TelemetrySample;
  configs: AlarmConfig[];
  /** Open alarms of this node (active, acknowledged or cleared but unacknowledged). */
  alarms: AlarmRecord[];
}

/** True while an alarm of the given key is in its active condition. */
export function isAlarmActive(alarms: AlarmRecord[], key: string): boolean {
  return alarms.some((a) => a.key === key && (a.state === 'active' || a.state === 'acknowledged'));
}

export function threshold(configs: AlarmConfig[], key: string): number | undefined {
  const config = configs.find((c) => c.key === key);
  return config?.enabled ? config.threshold : undefined;
}

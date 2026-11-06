import type { ModuleManifest, NodeInfo, TelemetrySample } from '@integralo/contract';
import { useAlarmConfigs, useOpenAlarms } from '@/api/queries';
import { usePreferences } from '@/features/preferences/preferences.store';
import { moduleViews } from '@/modules/registry';
import { GenericSynoptic } from './GenericSynoptic';

/**
 * Picks the module's graphic view for the style chosen in Preferences (isometric falls
 * back to the flat synoptic when the module has none, and that to the generic one), and
 * feeds it thresholds and alarms.
 */
export function NodeSynoptic({ node, manifest, sample }: { node: NodeInfo; manifest: ModuleManifest; sample: TelemetrySample }) {
  const style = usePreferences((s) => s.visualStyle);
  const configs = useAlarmConfigs(node.id).data ?? [];
  const alarms = (useOpenAlarms().data ?? []).filter((a) => a.nodeId === node.id && a.state !== 'closed');
  const visual = moduleViews[manifest.id]?.Visual;
  const View = (style === 'iso' ? visual?.iso : undefined) ?? visual?.flat ?? GenericSynoptic;
  return <View node={node} manifest={manifest} sample={sample} configs={configs} alarms={alarms} />;
}

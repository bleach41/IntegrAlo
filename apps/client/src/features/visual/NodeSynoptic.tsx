import type { ModuleManifest, NodeInfo, TelemetrySample } from '@integralo/contract';
import { useAlarmConfigs, useOpenAlarms } from '@/api/queries';
import { moduleViews } from '@/modules/registry';
import { GenericSynoptic } from './GenericSynoptic';

/** Picks the module's own synoptic or the generic one, and feeds it thresholds and alarms. */
export function NodeSynoptic({ node, manifest, sample }: { node: NodeInfo; manifest: ModuleManifest; sample: TelemetrySample }) {
  const configs = useAlarmConfigs(node.id).data ?? [];
  const alarms = (useOpenAlarms().data ?? []).filter((a) => a.nodeId === node.id && a.state !== 'closed');
  const Synoptic = moduleViews[manifest.id]?.Synoptic ?? GenericSynoptic;
  return <Synoptic node={node} manifest={manifest} sample={sample} configs={configs} alarms={alarms} />;
}

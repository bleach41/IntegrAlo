import type { ComponentType } from 'react';
import type { SummaryProps } from '@/features/nodes/GenericSummary';
import type { VisualProps } from '@/features/visual/types';
import { TankIso } from './tank-level/TankIso';
import { TankSynoptic } from './tank-level/TankSynoptic';
import { TemperatureIso } from './temperature/TemperatureIso';
import { TemperatureSummary } from './temperature/TemperatureSummary';
import { TemperatureSynoptic } from './temperature/TemperatureSynoptic';

/**
 * Optional module-specific views, by module id. A module that is not listed here is
 * still fully usable: every screen falls back to the generic views built from its
 * manifest. Specific views only add what a manifest cannot express.
 */
export interface ModuleViews {
  /** Compact summary for dashboard cards. */
  Summary?: ComponentType<SummaryProps>;
  /** Graphic views of the process: ISA-101 flat synoptic and, optionally, an isometric one. */
  Visual?: { flat: ComponentType<VisualProps>; iso?: ComponentType<VisualProps> };
}

export const moduleViews: Record<string, ModuleViews> = {
  temperature: { Summary: TemperatureSummary, Visual: { flat: TemperatureSynoptic, iso: TemperatureIso } },
  'tank-level': { Visual: { flat: TankSynoptic, iso: TankIso } },
};

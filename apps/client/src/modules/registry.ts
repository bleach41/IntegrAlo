import type { ComponentType } from 'react';
import type { SummaryProps } from '@/features/nodes/GenericSummary';
import type { VisualProps } from '@/features/visual/types';
import { TankSynoptic } from './tank-level/TankSynoptic';
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
  /** Graphic view of the process (ISA-101 flat synoptic). */
  Synoptic?: ComponentType<VisualProps>;
}

export const moduleViews: Record<string, ModuleViews> = {
  temperature: { Summary: TemperatureSummary, Synoptic: TemperatureSynoptic },
  'tank-level': { Synoptic: TankSynoptic },
};

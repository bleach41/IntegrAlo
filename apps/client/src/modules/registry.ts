import type { ComponentType } from 'react';
import type { SummaryProps } from '@/features/nodes/GenericSummary';
import { TemperatureSummary } from './temperature/TemperatureSummary';

/**
 * Optional module-specific views, by module id. A module that is not listed here is
 * still fully usable: every screen falls back to the generic views built from its
 * manifest. Specific views only add what a manifest cannot express.
 */
export interface ModuleViews {
  Summary?: ComponentType<SummaryProps>;
}

export const moduleViews: Record<string, ModuleViews> = {
  temperature: { Summary: TemperatureSummary },
};

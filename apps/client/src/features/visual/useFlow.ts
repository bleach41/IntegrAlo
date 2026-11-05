import { useEffect, useState } from 'react';

/** Length of the dash pattern used by flow lines (dash + gap). */
export const FLOW_DASH = '6 6';
const PATTERN = 12;
const STEPS_PER_SECOND = 15;

/**
 * strokeDashoffset that advances while `active`, so dashed lines appear to flow.
 * A plain timer instead of Reanimated: a few frames per second are enough for a flow
 * indicator and it behaves the same on phones and on the web. It stops when inactive.
 */
export function useFlowOffset(active: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setStep((s) => (s + 1) % PATTERN), 1000 / STEPS_PER_SECOND);
    return () => clearInterval(id);
  }, [active]);
  return -step;
}

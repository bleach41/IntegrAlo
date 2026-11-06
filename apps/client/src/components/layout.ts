import { useWindowDimensions } from 'react-native';

/** Width from which the navigation moves to a side bar and cards use several columns. */
export const WIDE_BREAKPOINT = 900;

export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}

/** Height kept free at the bottom of each tab screen on phones for the floating tab bar (plus the safe area). */
export const FLOATING_NAV_SPACE = 96;

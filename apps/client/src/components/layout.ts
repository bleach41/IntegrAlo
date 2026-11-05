import { useWindowDimensions } from 'react-native';

/** Width from which the navigation moves to a side bar and cards use several columns. */
export const WIDE_BREAKPOINT = 900;

export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}

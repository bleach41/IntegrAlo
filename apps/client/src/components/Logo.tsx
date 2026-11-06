import Svg, { Circle, Defs, G, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * The IntegrAlo logo: a central node linked to three nodes on a rounded green square. Same
 * geometry and colors as the app icons (scripts/make-icons.py) and the server panel logo; the
 * green is the brand accent of the palette, so it is the same in the light and dark themes.
 */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="IntegrAlo">
      <Defs>
        <LinearGradient id="integralo-logo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#10b981" />
          <Stop offset="1" stopColor="#047857" />
        </LinearGradient>
      </Defs>
      <Rect x="4" y="4" width="92" height="92" rx="20" fill="url(#integralo-logo)" />
      <G stroke="#fff" strokeWidth={4.5}>
        <Line x1="50" y1="53" x2="50" y2="26" />
        <Line x1="50" y1="53" x2="73.4" y2="66.5" />
        <Line x1="50" y1="53" x2="26.6" y2="66.5" />
      </G>
      <G fill="#fff">
        <Circle cx="50" cy="53" r="11.5" />
        <Circle cx="50" cy="26" r="7.5" />
        <Circle cx="73.4" cy="66.5" r="7.5" />
        <Circle cx="26.6" cy="66.5" r="7.5" />
      </G>
      <Circle cx="50" cy="53" r="5.2" fill="#0a966b" />
    </Svg>
  );
}

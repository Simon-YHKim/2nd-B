// Eye / eye-off icons for password visibility toggles (refine-v2 #6).
// Inline react-native-svg so they work on native + web with no asset load.
// Paths mirror the provided eye_icon.svg / eye_off_icon.svg.

import Svg, { Path, Circle } from "react-native-svg";

import { cosmic } from "@/lib/theme/tokens";

export function EyeIcon({ size = 20, color = cosmic.signalMint }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function EyeOffIcon({ size = 20, color = cosmic.mistGray }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 3l18 18" />
      <Path d="M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-4.8" />
      <Path d="M9.9 5.2A10.5 10.5 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.1 4.1" />
      <Path d="M6.1 6.8C3.5 8.6 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.2-1" />
    </Svg>
  );
}

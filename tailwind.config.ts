// Tailwind config — TypeScript so it can import the design tokens directly
// (Tailwind 3.4 loads .ts configs via jiti). NativeWind preset enabled.
import { colors, spacing, radius, fontSize } from "./src/theme/tokens";

const config = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors,
      spacing,
      borderRadius: radius,
      fontSize,
      fontFamily: {
        "serif-ko": ["NanumMyeongjo-Regular", "serif"],
        "serif-ko-bold": ["NanumMyeongjo-Bold", "serif"],
        "serif-en": ["SourceSerif4-Regular", "serif"],
        sans: ["Pretendard", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
    },
  },
};

export default config;

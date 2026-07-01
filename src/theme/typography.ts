// Typography — Deep-Space design canon.
// Body Korean: Pretendard. Pixel title/Korean mono: Galmuri11. Tiny labels/tags:
// Press Start 2P. Fonts are loaded in src/app/_layout.tsx through fontAssets.

import { Platform } from "react-native";

const BODY = Platform.select({
  ios: "Pretendard",
  android: "Pretendard",
  web: '"Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  default: "sans-serif",
});

const PIXEL_KO = Platform.select({
  ios: "Galmuri11",
  android: "Galmuri11",
  web: '"Galmuri11", monospace',
  default: "monospace",
});

const PIXEL_EN = Platform.select({
  ios: "PressStart2P",
  android: "PressStart2P",
  web: '"PressStart2P", monospace',
  default: "monospace",
});

export const fontFamilies = {
  serifKo: PIXEL_KO,
  serifEn: PIXEL_EN,
  sans: BODY,
  mono: PIXEL_EN,
  pixel: PIXEL_KO,
  pixelKo: PIXEL_KO,
  pixelEn: PIXEL_EN,
  readable: BODY,
} as const;

export const fontWeights = {
  regular: "400",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

export const fontAssets = {
  Pretendard: require("../../assets/fonts/Pretendard-Regular.otf"),
  Galmuri11: require("../../assets/fonts/Galmuri11-subset.ttf"),
  PressStart2P: require("@expo-google-fonts/press-start-2p/400Regular/PressStart2P_400Regular.ttf"),
  // Material 3 chrome (rev2 migration, P1b). Keys MUST equal the m3.font strings
  // (m3.font.chrome "Roboto" / mono "RobotoMono") so migrated screens resolve them.
  // Three weights are registered so Android renders M3 medium/bold without faux-bold.
  Roboto: require("@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf"),
  RobotoMedium: require("@expo-google-fonts/roboto/500Medium/Roboto_500Medium.ttf"),
  RobotoBold: require("@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf"),
  RobotoMono: require("@expo-google-fonts/roboto-mono/400Regular/RobotoMono_400Regular.ttf"),
};

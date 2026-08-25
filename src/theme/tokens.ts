// Deep-Space tokens — 디자인 정본에서 추출.
//
// ⚠ 이 파일은 `src/lib/theme/tokens.ts` 와 **다른 파일이다.** 이름이 거의 같아서
// 착각하기 쉬운데 둘 다 살아 있고, 이 쪽은 `dds-styles.ts` 를 통해 딥스페이스
// 디자인 화면 전부의 **카드·경계·배경**을 칠한다.
//
// ── 표면 그룹 이주 (2026-08-30) ────────────────────────────────────────────
//
// #1415 가 `src/lib/theme/tokens.ts` 의 표면을 캐논 midnight 램프로 옮겼는데,
// 화면을 다시 재보니 manual 45% · formats 27% 를 캐논에 없는 `#0d1825` 가
// 차지하고 있었다. 역산하니 **`rgba(70,182,255,0.06)` 을 `#0a0e18` 위에 얹은 값**
// 이었다 — 알파 0.06 으로 풀면 rgb(60,181,241) ≈ #46B6FF. 즉 여기 `cardBg` 다.
//
// 그래서 이 파일은 "11개 파일이 읽는 남은 사본"이 아니라 **디자인 화면의 카드를
// 실제로 칠하는 곳**이었다. 표면만 램프로 옮긴다.
//
// ⚠ 강조색(cyan/soul/mint 계열)은 **손대지 않았다.** 앱 정체성 색이라 별건이다.

export const colors = {
  // Canonical deep-space keys.
  bgDeep: "#0a0e18", // 캐논 --c00
  bgMid: "#141b2e", // 캐논 --c01
  bgGlow: "#232e4a", // 캐논 --c02 (반투명 파랑 대신 램프 한 칸)
  cyan: "#46B6FF",
  cyanBright: "#5FD4FF",
  cyanSoft: "#9FE4FF",
  cyanDim: "#7FC9F0",
  textHi: "#E8F7FF",
  textMid: "rgba(159,228,255,0.80)",
  textLo: "rgba(159,228,255,0.55)",
  textTitle: "#CCFAFF",
  soul: "#C8B6FF",
  soulDeep: "#8B7BD8",
  soulLine: "rgba(167,139,250,0.50)",
  mint: "#5FF0C0",
  border: "#232e4a", // 캐논 --c02
  borderHi: "#3d4866", // 캐논 --c03
  cardBg: "#141b2e", // 캐논 --c01 — 이것이 #0d1825 의 정체였다

  // Backward-compatible aliases for existing imports.
  paper: "#0a0e18",
  paper2: "#141b2e",
  paper3: "#232e4a",
  mist: "#141b2e",
  rule: "#232e4a",
  ruleSoft: "#1b2440",
  ink: "#E8F7FF",
  ink2: "rgba(159,228,255,0.80)",
  ink3: "rgba(159,228,255,0.55)",
  pine: "#46B6FF",
  pineDeep: "#141b2e",
  pineSoft: "#7FC9F0",
  pineTint: "#9FE4FF",
  leaf: "#5FF0C0",
  leafSoft: "#9FE4FF",
  sun: "#C8B6FF",
  earth: "#8B7BD8",
  sky: "#9FE4FF",
  skyDeep: "#7FC9F0",
  sage: "#5FF0C0",
  amber: "#C8B6FF",
  clay: "#FF8FB8",
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 9,
  md: 13,
  lg: 18,
  pill: 999,
  phone: 38,
  xl: 18,
  "2xl": 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  md: 20,
  lg: 25,
  xl: 31,
  "2xl": 39,
  "3xl": 39,
  "4xl": 39,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;

// AppNav — retired.
//
// Per user directive (2026-05-28): the bottom "← 네비게이터로" Button is
// gone. The constellation IS the home; a small ← arrow in the top-left
// (BackArrow, mounted once in _layout.tsx) handles return. We keep the
// export + signature so the 6+ screens that already `import { AppNav }`
// + `<AppNav locale={locale} />` keep compiling without a touch.

export function AppNav(_props: { locale: "en" | "ko" }) {
  return null;
}

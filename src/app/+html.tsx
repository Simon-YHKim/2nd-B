// Expo Router web root HTML.
//
// 2026-05-27 / 2026-05-28 (user directive): the web shell must not reveal
// whitespace at the edges. Scroll + bounce on web exposed blank gutters around
// the constellation, so html/body stay locked to the viewport with
// overflow:hidden. Browser zoom remains available for accessibility; NavGraph
// keeps its own pinch handler.

import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

import { semantic } from "@/lib/theme/tokens";

// Reset inline so the rule lands in the first paint. The dark background
// matches cosmic.space950 (Deep Space Ink) so the white flash that would
// otherwise show during the initial render is hidden, and the very first
// paint already reads as the Cosmic Pixel Graph Village.
const PAGE_LOCK_CSS = `
html, body, #root, #__next {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
  overscroll-behavior: none;
  touch-action: pan-x pan-y;
  background-color: ${semantic.background};
}
*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
:focus-visible {
  outline: 2px solid ${semantic.brand};
  outline-offset: 3px;
}
a:focus-visible,
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[role="button"]:focus-visible,
[role="link"]:focus-visible,
[role="tab"]:focus-visible {
  outline: 2px solid ${semantic.brand};
  outline-offset: 3px;
}
/* Base pixel face for raw DOM text + form controls (everything that is not an
   RN <Text>, which sets its own inline font-family).
   2026-05-29 (user directive) this was NeoDunggeunmo. That family is no longer
   in fontAssets (src/theme/typography.ts), so useFonts() never injected its
   @font-face and this rule silently fell through to the browser's monospace.
   PIXEL-CLAY (Simon 2026-09-05, app-wide Galmuri): the base is Galmuri11, which
   useFonts() does register on web, so raw text finally gets the pixel face. */
html, body, #root, #__next, button, input, textarea, select {
  font-family: "Galmuri11", "GalmuriMono11", monospace;
}
/* P2-10 readable-font preference: useFontStyle() flips data-font on <html>
   so raw DOM text and form controls follow the option. The family chain
   mirrors fontFamilies.readable (src/theme/typography.ts). */
html[data-font="readable"], html[data-font="readable"] body,
html[data-font="readable"] button, html[data-font="readable"] input,
html[data-font="readable"] textarea, html[data-font="readable"] select {
  font-family: "Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* PWA manifest (O-R2 scrap track): registers the install metadata and
            the Web Share Target so Android share sheets can send pages into
            /capture. The href is rooted at the Pages base path
            (expo.experiments.baseUrl = /2nd-B); on the local dev server the
            link 404s, which browsers treat as "no manifest" - harmless. */}
        <link rel="manifest" href="/2nd-B/manifest.webmanifest" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: PAGE_LOCK_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

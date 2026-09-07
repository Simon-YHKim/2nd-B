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
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site-meta";

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
/* Pre-hydration base font. The @font-face rules are injected by expo-font's
   useFonts() after hydration from fontAssets (src/theme/typography.ts), so the
   names here must be faces that file actually registers: Galmuri11 (the
   PIXEL-CLAY body face) first, then Pretendard, then system fallbacks. The
   previous chain named "NeoDunggeunmo" / "NeoDunggeunmoCode", which no
   useFonts() call registers, so raw DOM text and form controls silently fell
   through to the browser monospace default (audit D5-14, fixed 2026-09-05). */
html, body, #root, #__next, button, input, textarea, select {
  font-family: "Galmuri11", "Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
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
        {/* Share copy for the public site. Wording lives in lib/site-meta so
            this head and the runtime document.title cannot drift.
            og:image is deliberately absent: Open Graph wants an absolute URL
            and this shell has no origin to build one from. Add it together
            with a share asset and the origin it is served from.

            NOTE on the <title> below: it is NOT the document title. Expo
            Router's vendored react-helmet-async injects its own
            <title data-rh="true"></title> at the very top of <head> (byte 38
            of the served page; this one lands at 234), and the FIRST title
            wins. It is empty because Head only renders inside a focused
            screen, and the static shell is the root layout's InlineLoader
            branch - no screen renders at all during export. So this tag is a
            fallback for anything reading the last title, while og:title and
            twitter:title below are what actually feed share cards. The
            browser tab is fixed at runtime instead (see _layout).
            Measured 2026-09-07 on the served bundle. */}
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="2nd-Brain" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={SITE_TITLE} />
        <meta name="twitter:description" content={SITE_DESCRIPTION} />
        <link rel="manifest" href="/2nd-B/manifest.webmanifest" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: PAGE_LOCK_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

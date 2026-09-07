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
import {
  SITE_DESCRIPTION,
  SITE_ORIGIN,
  SITE_SHARE_IMAGE,
  SITE_TITLE,
} from "@/lib/site-meta";

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
            og:image is an absolute URL built from SITE_ORIGIN, because Open
            Graph ignores relative paths. The asset is public/og-image.png and
            its source is design/og-card/ - regenerate it, never hand-edit.

            NOTE on the <title> below: it is the SECOND title in the served
            page and the FIRST one wins, so this is not what a reader gets.
            Expo Router's vendored react-helmet-async emits its own
            <title data-rh="true"> at the very top of <head> (byte 38; this
            one lands at 257).

            That helmet tag used to be EMPTY: <Head> only renders inside a
            focused screen and the static shell is the root layout's
            InlineLoader branch, so no screen rendered during export at all.
            The root layout now feeds that same helmet instance directly
            (SITE_HEAD in _layout.tsx), so byte 38 carries the real name.
            Controlled export 2026-09-08: identical tree, only _layout.tsx
            differing - byte 38 empty before, filled after.

            Keep this tag anyway - it is the fallback for any runtime where
            helmet does not render. og:title and twitter:title below are what
            feed share cards, and those were always correct. */}
        <title>{SITE_TITLE}</title>
        <meta name="description" content={SITE_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="2nd-Brain" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:title" content={SITE_TITLE} />
        <meta property="og:description" content={SITE_DESCRIPTION} />
        <meta property="og:url" content={`${SITE_ORIGIN}/`} />
        <meta property="og:image" content={SITE_SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={SITE_TITLE} />
        {/* summary_large_image, not summary: the card is 1200x630 and the small
            variant would crop it to a square thumbnail. */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={SITE_SHARE_IMAGE} />
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

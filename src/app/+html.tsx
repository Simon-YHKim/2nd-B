// Expo Router web root HTML.
//
// 2026-05-27 / 2026-05-28 (user directive): the page itself must NOT zoom
// AND must not reveal whitespace at the edges. Earlier the whole document
// scaled when the user pinched/ctrl-wheeled (blew up the insights ribbon,
// locale toggle, settings handle); later, scroll + bounce on web exposed
// blank gutters around the constellation. We lock viewport to scale=1
// AND lock html/body to 100vh × 100vw with overflow:hidden — the only
// thing that can zoom is the NavGraph (its own pinch handler).

import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

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
  background-color: #070A18;
}
*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}
/* NeoDunggeunmo pixel font app-wide (user directive 2026-05-29). The
   @font-face for "NeoDunggeunmo" / "NeoDunggeunmoCode" is injected by
   expo-font's useFonts() after hydration; this sets the inherited base so
   every element (incl. raw text + form controls) renders in the pixel face. */
html, body, #root, #__next, button, input, textarea, select {
  font-family: "NeoDunggeunmo", "NeoDunggeunmoCode", monospace;
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
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: PAGE_LOCK_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

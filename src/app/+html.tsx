// Expo Router web root HTML.
//
// 2026-05-27 (user directive): the page itself must NOT zoom — earlier
// the whole document scaled when the user pinched/ctrl-wheeled, which
// blew up the insights ribbon, locale toggle, settings handle, etc.
// We lock the document viewport to scale=1 and route zoom intent into
// the NavGraph component only (it handles its own pinch + wheel).
//
// Accessibility note: we still allow user pinch on the graph itself
// via NavGraph's pinch handler, and the locale toggle stays large
// enough at base size.

import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

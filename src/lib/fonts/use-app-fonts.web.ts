// App fonts, web: loaded after the opening has its images, while it plays.
//
// Why (measured 2026-10-03/04, Simon asked why the wait before the opening is
// so long): useFonts() also runs in the static render, where expo-font writes a
// `<link rel="preload">` for every face into the HTML head. The seven faces are
// about 1.5 MB, and the browser fetched them at high priority alongside the
// 2.2 MB app code. Loading them from an effect removes that, but then they
// start right after the code, together with the opening's images, and still
// take the line from them (first scene 9.5 s -> 9.1 s only, 4G-like). So they
// wait for the opening's images (opening-images-signal.ts), bounded by
// FONT_FALLBACK_MS, and download during the 10 s opening.
//
// The opening does not need these faces; the root layout lets it play while
// they load and holds only its hand-over until they are in (see _layout.tsx).
import { useEffect, useState } from "react";
import { loadAsync } from "expo-font";

import { whenOpeningImagesSettled } from "@/lib/opening/opening-images-signal";
import { fontAssets } from "@/theme/typography";

/** Longest the fonts wait for the opening's images before loading anyway. */
export const FONT_FALLBACK_MS = 6000;

/** [loaded, error], like useFonts(). Starts false on the server and on the first client render. */
export function useAppFonts(): [boolean, Error | null] {
  const [state, setState] = useState<[boolean, Error | null]>([false, null]);
  useEffect(() => {
    let alive = true;
    const cancel = whenOpeningImagesSettled(() => {
      loadAsync(fontAssets).then(
        () => { if (alive) setState([true, null]); },
        (error: unknown) => { if (alive) setState([false, error instanceof Error ? error : new Error(String(error))]); },
      );
    }, FONT_FALLBACK_MS);
    return () => { alive = false; cancel(); };
  }, []);
  return state;
}

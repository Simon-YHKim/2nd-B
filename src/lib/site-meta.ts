// Single source for the public web shell's name and one-line description.
//
// Two places need these strings and they must not drift: the static <head>
// in `src/app/+html.tsx` (what crawlers read) and the runtime document.title
// set in the root layout (what a browser tab shows). Before this file the
// wording was pasted six times in +html.tsx alone.
//
// The wording is the reviewed store draft
// (docs/store-copy/drafts.json :: ko.appStoreSubtitle / ko.playShort) so the
// site, the listing and the app say the same thing.
//
// The name before " · " is SITE_NAME: PolaScope, the app name Simon fixed on
// 2026-09-27 ("지금부터 앱 이름은 PolaScope", DECISIONS 26.09.27). It replaced
// the short-lived web/ad name 2ndB the same day. The store listings still say
// 2nd-Brain until they are renamed in the consoles; that is a separate step.
export const SITE_NAME = "PolaScope";
export const SITE_TITLE = `${SITE_NAME} · 기록으로 알아가는 나`;
export const SITE_DESCRIPTION =
  "경험과 메모를 모아 나를 돌아보고, 허슬케이와 기록을 바탕으로 이야기합니다.";

// Where the site is actually served, including the Pages sub-path
// (expo.experiments.baseUrl = /2nd-B). Only share metadata needs this: Open
// Graph and Twitter cards ignore relative paths, so the image has to be an
// absolute URL and the shell has no origin to build one from at runtime.
//
// ⚠ If the deploy target ever moves, change this line. Nothing breaks loudly
// when it is wrong - the page still loads and only the link preview silently
// stops resolving its image.
export const SITE_ORIGIN = "https://simon-yhkim.github.io/2nd-B";

// 1200x630, regenerated from design/og-card/og-card.html - see that folder's
// README before touching the PNG.
export const SITE_SHARE_IMAGE = `${SITE_ORIGIN}/og-image.png`;

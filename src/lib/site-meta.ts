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
export const SITE_TITLE = "2nd-Brain · 기록으로 알아가는 나";
export const SITE_DESCRIPTION =
  "경험과 메모를 모아 나를 돌아보고, 세컨비와 기록을 바탕으로 이야기해요.";

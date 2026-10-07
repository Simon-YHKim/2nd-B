// expo-router special file: on native, every incoming system link (the launch
// link and links that arrive while the app runs) passes through
// redirectSystemPath before it is routed. It is not a screen.
//
// One link is rewritten: the Android share sheet hand-off
// <scheme>://share-intent?text=&title= becomes /capture?text=&title=&from=share
// (see src/lib/capture/share-intent.ts for why it is not a plain capture link;
// the marker only picks a one-line notice when a gate turns the route away).
// Every other link, sign-in and password-reset links included, comes back
// unchanged, byte for byte.

import { redirectSharedIntentPath } from "@/lib/capture/share-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectSharedIntentPath(path);
}

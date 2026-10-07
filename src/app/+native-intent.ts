// expo-router special file: on native, every incoming system link (the launch
// link and links that arrive while the app runs) passes through
// redirectSystemPath before it is routed. It is not a screen.
//
// One link is rewritten: the Android share sheet hand-off
// <scheme>://share-intent?text=&title= becomes
// /capture?text=&title=&shareDelivery=<id> (see src/lib/capture/share-intent.ts
// for why it is not a plain capture link, and ./share-delivery.ts next to it
// for the id: the capture screen fills only for a signed-in account with a
// complete profile). Every other link, sign-in and password-reset links
// included, comes back unchanged.

import { redirectSharedIntentPath } from "@/lib/capture/share-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectSharedIntentPath(path);
}

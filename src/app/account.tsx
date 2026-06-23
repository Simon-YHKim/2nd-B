// task C: account controls — the minor/adult self-service rights surface.
//   - DOB correction (re-validated server-side by the 0030 trigger).
//   - Privacy & consent controls (link to /privacy, where sharing / profiling /
//     processing are withdrawn per-key; teens stay locked to high-privacy).
//   - Account deletion (terminal): a best-effort client content wipe, then the
//     delete-account Edge Function (service role) erases public.users -> cascade
//     across every owned table + the auth.users row, then sign out.
//
// The canonical deep-space surface is DeepSpaceAccountDesignScreen.

import { DeepSpaceAccountDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Account() {
  return <DeepSpaceAccountDesignScreen />;
}

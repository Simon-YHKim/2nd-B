// Route: /sign-in. The screen itself is DeepSpaceSignInDesignScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space and `ui-mode.ts` defaults to it, so that branch
// had been unreachable for months; it now lives in legacy/screens/sign-in.tsx,
// out of the build but still readable.
//
// The login redirect and the session gate live in the screen, not here — the
// route renders it unconditionally.
import { DeepSpaceSignInDesignScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function SignIn() {
  return <DeepSpaceSignInDesignScreen />;
}

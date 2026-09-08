// Route: /sign-up. The screen itself is DeepSpaceSignUpDesignScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space and `ui-mode.ts` defaults to it, so that branch
// had been unreachable for months; it now lives in legacy/screens/sign-up.tsx,
// out of the build but still readable.
//
// ⚠ The import path matters: dds-auth-screens.tsx exports a same-named shadow
// copy that no route renders. This is the one origin/main imported.
import { DeepSpaceSignUpDesignScreen } from "@/screens/deepspace/dds-sign-up-screen";

export default function SignUp() {
  return <DeepSpaceSignUpDesignScreen />;
}

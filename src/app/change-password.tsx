// Route: /change-password. The screen itself is DeepSpaceChangePasswordScreen.
//
// This file used to carry a second, full implementation of the same screen for
// the `EXPO_PUBLIC_UI=legacy` track and pick between them at render. Every
// delivery path pins deep-space with no variable able to override it, so that
// branch had been unreachable for months; it is gone. The current-password
// field is still mandatory (Supabase Auth "Require current password when
// updating", Email provider, 2026-08-10) and the deep-space screen says so up
// front rather than letting the server refuse after the fact.
import { DeepSpaceChangePasswordScreen } from "@/screens/deepspace/dds-change-password-screen";

export default function ChangePassword() {
  return <DeepSpaceChangePasswordScreen />;
}

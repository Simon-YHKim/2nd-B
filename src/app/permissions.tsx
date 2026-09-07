// Route: /permissions. The screen itself is DeepSpacePermissionsScreen.
//
// The legacy-track copy of this screen lived here and was chosen at render by
// EXPO_PUBLIC_UI. Every delivery path pins deep-space with no variable able to
// override it, so it was unreachable; it now lives in
// legacy/screens/permissions.tsx, out of the build but still readable.
// Accessibility comes from the shared Toggle row (role=switch + checked state
// + label), not from hints written into this file.
import { DeepSpacePermissionsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

export default function Permissions() {
  return <DeepSpacePermissionsScreen />;
}

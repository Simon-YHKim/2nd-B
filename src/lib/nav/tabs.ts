// Single source of truth for the primary bottom-tab routes (menu restructure
// Phase 3). The tab bar uses this to decide where it SHOWS; the BackArrow uses
// it to decide where it HIDES (a tab screen already has persistent bottom
// navigation, so the floating back arrow would be redundant); and the app
// shell uses it to reserve bottom clearance for the bar. Keeping one list here
// means those three can never drift apart again — the desync that briefly left
// /core-brain, /records and /wiki with no back affordance AND no tab bar.

export const PRIMARY_TAB_PATHS = ["/", "/capture", "/secondb", "/profile"] as const;

export type PrimaryTabPath = (typeof PRIMARY_TAB_PATHS)[number];

// Settings is a retained stack route reached from /profile. It is intentionally
// not a primary tab destination.
export const PROFILE_CHILD_PATHS = ["/settings"] as const;

export type ProfileChildPath = (typeof PROFILE_CHILD_PATHS)[number];

/** True when the route is a primary tab destination (shows the bottom tab bar
 *  and therefore hides the floating back arrow). */
export function isPrimaryTabPath(pathname: string): boolean {
  return (PRIMARY_TAB_PATHS as readonly string[]).includes(pathname);
}

/** True when the route is one depth under the profile hub. */
export function isProfileChildPath(pathname: string): boolean {
  return (PROFILE_CHILD_PATHS as readonly string[]).includes(pathname);
}

// Deep-space routes that render the persistent bottom dock (DeepSpaceScreen).
// On these the floating BackArrow chip is redundant AND overlaps the
// SecondbStatusHeader head, so it is hidden in deep-space mode (the dock — plus
// hardware back — is the nav affordance there). The primary tab roots
// (/, /capture, /secondb) also render the dock but are already hidden by
// isPrimaryTabPath, so they are intentionally omitted here. Legacy mode
// (EXPO_PUBLIC_UI=legacy) uses PremiumAppShell with no dock, so the chip stays —
// callers MUST gate this list behind isDeepSpaceUI().
export const DEEP_SPACE_DOCK_PATHS = [
  "/audit",
  "/esm",
  "/core-brain",
  "/big-five",
  "/attachment",
  "/iden",
  "/imagine",
  "/interview",
  "/persona",
  "/account",
  "/ops",
] as const;

export type DeepSpaceDockPath = (typeof DEEP_SPACE_DOCK_PATHS)[number];

/** True when the route renders the deep-space bottom dock (DeepSpaceScreen).
 *  Gate behind isDeepSpaceUI() — legacy mode has no dock. */
export function isDeepSpaceDockPath(pathname: string): boolean {
  return (DEEP_SPACE_DOCK_PATHS as readonly string[]).includes(pathname);
}

// Single source of truth for the primary bottom-tab routes (menu restructure
// Phase 3). The tab bar uses this to decide where it SHOWS; the BackArrow uses
// it to decide where it HIDES (a tab screen already has persistent bottom
// navigation, so the floating back arrow would be redundant); and the app
// shell uses it to reserve bottom clearance for the bar. Keeping one list here
// means those three can never drift apart again — the desync that briefly left
// /core-brain, /records and /wiki with no back affordance AND no tab bar.

export const PRIMARY_TAB_PATHS = ["/", "/capture", "/secondb", "/profile"] as const;

export type PrimaryTabPath = (typeof PRIMARY_TAB_PATHS)[number];

/** True when the route is a primary tab destination (shows the bottom tab bar
 *  and therefore hides the floating back arrow). */
export function isPrimaryTabPath(pathname: string): boolean {
  return (PRIMARY_TAB_PATHS as readonly string[]).includes(pathname);
}

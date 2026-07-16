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
  // Dev-only reference (DevOnlyRoute): /graph renders the 내 두뇌 지도 design
  // screen inside the dock chrome in dev builds; production redirects home, so
  // registering it here is inert for users but keeps the drift guard honest.
  "/graph",
  "/big-five",
  "/attachment",
  "/iden",
  "/imagine",
  "/interview",
  "/persona",
  // T5 F2 (peer review): the subject-side invitation ledger lives on the lens track.
  "/peer-invites",
  // Call recording v1 (post-call reflection, docs/CALL-RECORDING-SPEC.md §5).
  "/call-reflection",
  "/account",
  "/ops",
  // /wiki joined the dock as a 5-tab root in P2-cont (#658 wraps it in
  // DeepSpaceScreen), so the floating BackArrow chip must hide there too.
  "/wiki",
  // P4c/d/e lens screens (people map / career CV timeline / rest board) all
  // render inside DeepSpaceScreen — same rule: the dock is the nav, no chip.
  "/people",
  "/career",
  "/rest",
  // P3/P5 self-understanding + sharing screens — surfaced by the dock-drift
  // guard test (they render DeepSpaceScreen directly, so the chip must hide).
  "/brightness",
  "/ipip-neo",
  "/ratifications",
  "/rlss",
  "/share-card",
  // AI 뮤지엄 (rev2 2-axis timeline) — the route file delegates, so the drift
  // guard's direct-render scan doesn't see it; registered here by hand.
  "/museum",
  // 커리어 3C4P Drill Down (P4d) — direct-render dock screen.
  "/career-drilldown",
  // 축 체크 3종 (P3b) — thin routes over AxisCheckScreen, so the drift guard's
  // direct-render scan doesn't see them; registered by hand like /museum.
  "/values",
  "/motivation",
  "/strengths",
  // 담기 풀 모드 (링크/클립/OCR/파일) — deep-space shell over the legacy pipes.
  "/capture-full",
  // 북극성 문장 편집 (Screen-Spec 21) — direct-render dock screen.
  "/northstar",
  // 설정 — rev2 windowed ROOT tab (5th dock slot); conditional render behind
  // isDeepSpaceUI so the drift guard's direct-render scan doesn't see it.
  "/settings",
  // windowed 코호트 4 — DockShell(inbox/focus) · OpsFrame(ops sub-screens) ·
  // interview Frame all render DeepSpaceScreen via shared wrappers, so the
  // drift guard's direct-render scan doesn't see them; registered by hand.
  "/interview",
  "/focus",
  "/inbox",
  "/reminders",
  "/reading",
  "/ledger",
  "/meals",
  "/milestones",
  "/side-project",
  // 요금제 — DockShell 경유(윈도우+탑바); 카드 구성/IAP 로직은 불변(수익화 게이트).
  "/plans",
  // 4th drift recurrence (a2z audit 2026-07-11): these render DeepSpaceScreen
  // through delegated modules or multiline JSX, both of which the old
  // single-line same-file guard scan missed — the drift test now follows
  // delegation, so new ones fail loudly instead of shipping a double back
  // affordance.
  "/records",
  "/data",
  "/integrations",
  "/import",
  "/growth",
  "/seen",
  "/beyond",
  "/trends",
  // /import-hub renders no dock but carries its own step-aware in-screen back
  // button (hub → router.back(), history → hub), which the floating chip
  // (→ home) contradicted; the chip yields to the in-screen control.
  "/import-hub",
] as const;

export type DeepSpaceDockPath = (typeof DEEP_SPACE_DOCK_PATHS)[number];

// Dynamic dock routes: expo-router paths like /star/career or /record/<uuid>
// can never equal an entry in the static list above, yet both render
// DeepSpaceScreen (museumLike star lens / windowed record detail) with their
// own M3 top-app-bar back — without the prefix match the floating BackArrow
// chip stacked a second, conflicting back control over that top bar.
export const DEEP_SPACE_DOCK_PREFIXES = ["/star/", "/record/"] as const;

// Routes that hide the floating BackArrow chip ENTIRELY (not because a dock or
// top bar replaces it, but because no back-to-home affordance belongs there):
// the pre-auth flow, the home roots, and one-shot onboarding flows whose
// in-screen CTA is the designed exit (/onboarding since J5, /ttfv same
// pattern — its 시작하기 CTA router.replace("/") is the exit). Lives here (not
// in BackArrow.tsx) so nav visibility has ONE source of truth the dock-drift
// guard can check against.
export const BACK_ARROW_HIDDEN_PATHS = [
  "/sign-in",
  "/sign-up",
  "/complete-profile",
  "/oauth-callback",
  "/",
  "/onboarding",
  "/ttfv",
  "/deepspace-home",
] as const;

/** True when the route renders the deep-space bottom dock (DeepSpaceScreen).
 *  Gate behind isDeepSpaceUI() — legacy mode has no dock. */
export function isDeepSpaceDockPath(pathname: string): boolean {
  return (
    (DEEP_SPACE_DOCK_PATHS as readonly string[]).includes(pathname) ||
    DEEP_SPACE_DOCK_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

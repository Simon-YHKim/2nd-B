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
  // 2026-08-30: 이 열한 라우트는 DeepSpaceDesignScreens 의 로컬 `Shell` 을 쓰는데,
  // 그 Shell 이 dock 없는 순수 View 였다가 DockShell(=DeepSpaceScreen) 로 위임되면서
  // **독을 갖게 됐다.** 레지스트리를 같이 안 옮기면 여기 목록은 화면과 반대를 말하고,
  // 그 거짓이 뜬 back 칩 중복(이 목록이 막으려던 바로 그 버그)으로 돌아온다.
  "/discover",
  "/formats",
  "/insights",
  "/manual",
  "/permissions",
  "/privacy",
  "/research",
  "/review",
  "/srs",
  "/support",
  "/theme",
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
  // Community chat v1 (0117): room list renders the windowed dock shell with
  // its own M3 top-app-bar back.
  "/community",
  // Call recording v1 (post-call reflection, docs/CALL-RECORDING-SPEC.md §5).
  "/call-reflection",
  "/account",
  // 로그인 세션의 비밀번호 변경은 계정 허브 아래 설정 소유 화면이다. PIXEL-CLAY
  // renderer가 DeepSpaceScreen 독과 자체 상단 뒤로를 함께 쓰므로 떠 있는 뒤로 칩은 숨긴다.
  "/change-password",
  // 구독 관리 (0115 self-serve cancel + refund): a windowed dock screen whose M3
  // top app bar carries the back arrow, so the floating chip must hide - back
  // lives in exactly one place.
  "/subscription",
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
  // 성과 입력 (sb-careerinput) — the seven-section achievement form the timeline
  // pushes to. Same rule as its parent: dock is the nav, no floating chip.
  "/career-input",
  // 내 생활 정보 (D2, 2026-08-18) — 프로필 별을 채우는 폼. /profile 메뉴에서
  // 들어간다. 부모와 같은 규칙: dock 이 내비게이션이고 떠 있는 칩은 없다.
  "/profile-details",
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
  // 리즈닝·공지 — rev2 windowed sub-screens. Both use DeepSpaceScreen's
  // persistent dock plus their own M3 top-app-bar back, so the root floating
  // BackArrow must stand down.
  "/reasoning",
  "/notices",
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
  // 오늘의 정리 — 2026-08-30 에 공용 셸로 옮겨 독을 되찾았다(#1409 계열 16번째).
  "/digest",
  // /import-hub — 2026-08-30 부터 **실제로 독을 그린다**(DeepSpaceScreen 경유).
  // 그 전까지는 자기 SafeAreaView 로 프레임을 직접 세워 독이 없었고, 이 줄은
  // "독은 없지만 자기 뒤로 버튼이 있으니 떠 있는 칩은 물러나라"는 뜻이었다.
  // 이제는 이름 그대로다. 단계 안의 뒤로(‹)는 그대로 남아 있고, 그것이 이
  // 화면의 유일한 뒤로다(독은 뒤로가 아니라 탭 이동).
  "/import-hub",
] as const;

export type DeepSpaceDockPath = (typeof DEEP_SPACE_DOCK_PATHS)[number];

// Dynamic dock routes: expo-router paths like /star/career or /record/<uuid>
// can never equal an entry in the static list above, yet both render
// DeepSpaceScreen (museumLike star lens / windowed record detail) with their
// own M3 top-app-bar back — without the prefix match the floating BackArrow
// chip stacked a second, conflicting back control over that top bar.
export const DEEP_SPACE_DOCK_PREFIXES = ["/star/", "/record/", "/community/"] as const;

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

# Deep-space UI — Nav Contract (O-23 Stage③ spec)

> Status: SPEC (authored before wiring, per D-23 + Grok's nav-contract risk).
> Drives Stage③ (connect all features) and the E2E gate. Legacy (gameboy) track
> is unaffected — this only governs `EXPO_PUBLIC_UI=deep-space`.

## 1. Goal

Every existing expo-router route stays mounted and reachable from the new
deep-space shell, with no feature dropped (누락 0). The deep-space shell becomes
the router home; the gameboy graph keeps its own reachable route.

## 2. Architecture (D-23 C)

- The Stack in `_layout.tsx` mounts ALL routes in BOTH modes (revert the Stage①
  whole-tree replacement). The flag only swaps WHICH component the home renders
  and the theming, not whether routes exist.
- `index` (`/`) branches on `isDeepSpaceUI()`:
  - legacy → the village graph (current `index.tsx` body) — unchanged.
  - deep-space → `<DeepSpaceShell/>` (the character home).
- The village graph gets a dedicated route `graph` (`/graph`) that renders the
  SAME graph view via a shared `GraphScreen` component extracted from `index.tsx`
  (both `index` legacy and `/graph` import it — no logic fork). The deep-space
  `그래프` menu routes to `/graph`.
- Navigation from the shell uses `router.push("/<route>")`; BackArrow + the
  router's back stack return to the shell. A deep-space tab bar variant (or the
  existing PremiumTabBar re-themed) shows on the 4 primaries.

## 3. D-22 IA → route map (the wiring table)

Primary menu (shell home, 4 items):

| Menu | Route | Notes |
|---|---|---|
| 그래프 | `/graph` | shared GraphScreen (village). NOT `/` (that's the shell). |
| 담기 | `/capture` | |
| 세컨비 | `/secondb` | mode toggle 자비스/공상 in-screen (`/jarvis`,`/imagine` are redirects) |
| 나 | `/profile` | |

Head-right icons (not in the 4-menu): 나/프로필 `/profile`, 설정 `/settings`.

Second-tier (reached inside each primary screen):

| Parent | Sub | Route |
|---|---|---|
| 그래프 | 위키 / 기록 / 리서치 | `/wiki` · `/records`(→`/record/[id]`) · `/research` |
| 담기 | 형식 / 가져오기 / 받은항목 / 수동입력 | `/formats` · `/import` · `/inbox` · `/manual` |
| 나 | 소울코어 / 나의모습 / 통찰 | `/core-brain` · `/persona` · `/insights` |
| 나 · 자기검사 허브 | 빅5 / MBTI / 애착 / 네영역 / 순간기록 / 인터뷰 / 자기점검 | `/big-five` · `/mbti` · `/attachment` · `/trinity` · `/esm` · `/interview` · `/audit` |
| 설정 | 계정 / 요금제 / 개인정보 / 권한 / 데이터 / 테마 / 지원 / 운영진단 | `/account` · `/plans` · `/privacy` · `/permissions` · `/data` · `/theme` · `/support` · `/ops` |

Auth/system (not in deep-space menus, but reachable by flow): `(auth)/*`,
`/onboarding`, `/journal`, `/+not-found`. These keep their existing entry paths
(redirects, deep-links) and are gated as today (C10/PIPA in IntroGate — unchanged).

Coverage check: 40 app routes; every one appears above or is an auth/system
flow → 누락 0 once Stage③ wires the primary + second-tier entries.

## 4. Back / deeplink / tab behavior (E2E gate)

- **Back**: from any pushed screen → returns to the shell (or the prior screen if
  nested). The deep-space shell home is the back-stack root; pressing back at the
  root is a no-op (no exit-to-blank). BackArrow already present.
- **Deeplink**: `/<route>` direct loads still resolve (Pages `/2nd-B/<route>` +
  native scheme). The shell is `/`; sub-screens are their own paths.
- **Tabs**: the 4 primaries show the tab bar; modal/sub flows (capture inputs,
  tests) hide it (existing PremiumTabBar "primary routes only" rule).
- **Mode parity**: legacy back/deeplink/tab behavior is unchanged under explicit
  `EXPO_PUBLIC_UI=legacy` (regression guard — legacy is now the rollback track,
  not the default).

## 5. E2E checklist (Stage③ acceptance, run per PR)

1. `EXPO_PUBLIC_UI=deep-space` web export renders the shell at `/`.
2. Each of the 4 primary menu taps lands on the correct route and renders.
3. From each primary, each second-tier entry is reachable and renders.
4. Back from a sub-screen returns to its parent / the shell (no dead-end).
5. Deep-link to 3 sample routes (`/wiki`, `/big-five`, `/settings`) loads directly.
6. `EXPO_PUBLIC_UI=legacy` → legacy graph at `/`, unchanged (rollback regression).
   (Default flipped 2026-06-17: an unset flag now resolves to deep-space; live
   builds pin `=legacy` until the shell completes, so this case still ships live.)
7. `npm run verify` + `expo export --platform web` green for both flag states.

## 6. Open / staged

- **Re-theming the 40 sub-screens** to deep-space tokens is OUT OF SCOPE for
  Stage③ (connection only). Sub-screens stay in their current theme until a later
  re-theme pass (large, Codex-distributable). Stage③ = reachable + working.
- The deep-space tab bar styling (re-theme PremiumTabBar vs a new variant) is a
  Stage③ implementation detail; default to re-theming via the deepSpace tokens.

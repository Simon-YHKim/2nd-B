# UI Audit — Static Findings (foundation pass)

> Read-only static analysis of `src/app/` + `src/components/` against the canon
> (docs/CONCEPT.md, DESIGN.md, CLAUDE.md). No app run. Generated as the
> foundation layer for the live UI audit. Truth sources cited inline.

---

## PART A — CANON RUBRIC (compact)

### (a) Canonical concept model — CANON vs LEGACY

**CANON (deep-space).** A character-led home shell is the single canonical app body
(`EXPO_PUBLIC_UI` default). Model (source: `2ndb-thought-organization-synthesis.html`,
restated in `docs/CONCEPT.md`):

- **북극성 (Soul Core)** = aggregate philosophy/identity readout; always brightest.
- **북두칠성 7별** = 7 self-understanding lenses: 지금의 나 / 회상 / 보여지는 나 / 리듬 /
  관계의 나 / 될 수 있는 나 / 가치의 나 — each with its own engine + brightness.
- **L1–L5 brightness ladder** = one ordinal scale doubling as quality, confidence, and
  the interview drill-stop level.
- **propose -> ratify** = AI proposes self-model diffs; user approves before any write.
- Living refs: `docs/deep-space-nav-contract.md`, `deepSpace.*` tokens in
  `src/lib/theme/tokens.ts`.

**LEGACY (rollback skin only, `EXPO_PUBLIC_UI=legacy`; never the reference for new work):**
gameboy UI track, Cosmic Pixel Graph Village / 마을 system, phytoncide tokens
(`src/theme/tokens.ts`, `@deprecated`), Brain Trinity naming, fixed village node-names
(Soul Core / Pattern Core x5 / snowflake / crystal; the *principle* carries, the *names*
do not), superseded docs in `docs/legacy/`.

### (b) Color rules

- Token system: `deepSpace.*` (`tokens.ts:236`). Core values: `bg #0A0E1A`,
  `accent #46B6FF` (cyan), `text #5FD4FF`, `card rgba(70,182,255,0.06)`,
  `cardLine rgba(70,182,255,0.24)`. Legacy `semantic.*` / `cosmic.*` remain for the
  legacy skin.
- **Accent budget** (replaced the old hard 3-color rule): 1 primary (mint `#72F2C7`) +
  5 reserved meaning-locked signals (signalBlue / soulViolet / pixelLamp / dreamPink /
  guardRose). **At most 3 of the six on any single screen.** Saturated accents stay
  sparse (bar/label/dot/border, never a fill on >30% of a screen).
- **Forbidden, exactly:** hex literals in components (always go through
  `semantic.*`/`cosmic.*`/`deepSpace.*`/`characters.*`); off-palette or decorative /
  multi-hue gradients (only `deepSpaceGradients` cyan/soul stops are sanctioned);
  glassmorphism / blurs / frosted surfaces; pill chips (`borderRadius: 9999`);
  beige/off-palette accents (green is reserved = mint meaning only); `borderLeft` decor
  except the rare 3px yellow-zone rephrase-hint border; **em dash in any user-visible
  string**; emojis as decoration; drop shadows on dark surfaces.

### (c) Fonts

- Body / long copy / chat / journal: **Pretendard** (`fontFamilies.readable`).
- Pixel chrome titles/buttons/tabs: **Galmuri11** KO (`fontFamilies.pixelKo`) /
  **Press Start 2P** EN (`fontFamilies.pixelEn`).
- Numbers/code: NeoDunggeunmoCode. (Note: a DESIGN.md Typography section still names
  NeoDunggeunmo app-wide; it is superseded-in-place by the O-9 table = Pretendard body +
  pixel chrome.)
- **Forbidden as primary:** Inter, Roboto, Space Grotesk, Poppins, Montserrat. Italic
  forbidden in UI.

### (d) Visual Tier table (CLAUDE.md standing rule)

| Tier | Node | Size | Glow / Opacity | Notes |
|---|---|---|---|---|
| 1 | Soul Core | 128px | Full brightness, max glow bloom | Root/hero, must dominate |
| 2 | Pattern Core (x5) | 82px | High brightness, strong glow | Secondary, color-coded |
| 3 | Pattern Data (snowflake) | 38px | Medium opacity, softer glow | Blue snowflakes |
| 4 | Pattern Link (crystal) | 30px | Lower opacity, subtle | Sub-nodes recede |

All links = cyan (no green trunks / violet leaves). Drilldown: selected tier-2 promoted
near tier-1; others recede.

### (e) Information density

One core message + one supporting graphic per screen. Strip other text/labels. Detail
appears only after tap/drilldown (progressive disclosure). One touch simplifies the
screen, never adds an overlapping layer. Back lives in exactly one place (O-7).

### (f) Mascot behavior

- **Large 세컨비 head** (under `SecondbHeadTrackProvider`): **tracks touch when size >= 80**
  (float + 표정 + emotion orb). Source: `SCREEN_TREE_SPEC.md` 0.1.
- **Small header head** (`SecondbStatusHeader`, top-left): **does NOT track** — static
  per-screen status face + speech bubble.

### (g) LEGACY-residue blocklist (flag on sight)

gameboy; Cosmic Pixel Graph Village / 마을 / village; phytoncide; Brain Trinity;
IslandArt; purple robot / cartoon mascot; old tier names (Free / Plus / Pro) used as
tier labels. (Sanctioned exceptions: the 6 closed pixel residents in
`src/lib/characters.ts`; `gameboy.*` token aliases that map to cosmic tokens.)

---

## PART B — ROUTE RECONCILIATION

### B1. Checklist routes with NO matching file (dead / missing — potential blockers)

| Route | Status | Notes |
|---|---|---|
| `/jot` | No file, no nav ref | Checklist marks it inline-in-onboarding ("+ /jot"). No standalone route; no `/jot` push anywhere. Acceptable IF it stays an onboarding sub-mode, but there is no `/jot` screen to QA. |
| `/trends` | **No file, no nav ref** | Listed under 매일 허브. No route file, no navigation target found. Dead checklist entry / unbuilt. |
| `/digest` | **No file** | No route file. Only a passing reference inside `src/screens/deepspace/ops/screens.tsx`; no `/digest` nav target. Unbuilt / dead. |
| `/museum` | **No file, no nav ref** | SCREEN_TREE_SPEC 0.2 says settings -> museum. No `/museum` route file and no push found. Dead link from settings if wired. |

The spec also names `회상(recall)` and `보여지는 나(peer)` lenses with no dedicated route
(folded into persona/audit/share) — not in the flat checklist, noted for IA.

### B2. Route files present but NOT in the checklist (extras)

| File | Classification | Evidence |
|---|---|---|
| `deepspace-home.tsx` | **dev/preview** | Renders `DeepSpaceHomeScreen`; linked only from `DeepSpaceFlowMapScreen` with note "preview". Not in tab nav. |
| `deepspace-hub.tsx` | **dev/preview** | `DeepSpaceHubDockScreen`; flowmap labels it "허브 preview / 4 panels". |
| `deepspace-flowmap.tsx` | **dev/preview index** | `DeepSpaceFlowMapScreen` — a self-described preview map linking the other deepspace-* previews. |
| `deepspace-preview.tsx` | **dev/preview** | `DeepSpaceComponentsPreview` — component gallery. |
| `reminders.tsx` | **live screen** | `RemindersScreen` (ops kit, ops-ia 4). Real ops domain screen, not in checklist. |
| `srs.tsx` | **live screen** | `DeepSpaceSrsScreen` — spaced-repetition language review (vision axis 2). Registered in `_layout`. Real, missing from checklist. |
| `import-hub.tsx` | **live screen** | `ImportHubScreen` — sensitivity-tiered consent-gated import hub; extends `/import`. The checklist's `/import` ("임포트 허브") arguably means this; both exist. |
| `import.tsx` | **live (dual)** | Legacy markdown-paste import OR `DeepSpaceImportScreen` via `isDeepSpaceUI()` (`import.tsx:302`). |

The four `deepspace-*` preview routes ARE registered for back-nav in
`src/components/ui/BackArrow.tsx:41-44` but are not primary nav; treat as dev surfaces to
exclude from the user-facing audit (or hide behind a flag before ship).

---

## PART C — STATIC UI-VIOLATION SCAN

Scope: `src/app/`, `src/components/` (+ `src/lib/theme`, `locales/`). Counts exclude the
lexicon allowlist (`src/lib/safety/lexicon.ts`, `safety/__tests__`, `*/safety.json`,
constraints/vision docs).

### C1. Hex color literals bypassing tokens — **0 real violations**

| Count | Detail |
|---|---|
| 4 | `src/components/deepspace/ops/kit.tsx:26,28,29,30` — all in **trailing comments** documenting the token value (`deepSpace.accent, // #46B6FF`). Tokens are actually used. Not a violation. |
| 1 | `src/app/capture.tsx:496` — `#300` is a **React error-code** reference in a comment ("React #300"). Not a color. |

No color-context hex assignments (`color:`/`background:`/`fill:` = `#...`) found in any
component/screen. Clean.

### C2. Em dash in user-facing strings — **0 in shipped strings**

- `locales/**` (EN+KO+es/id/pt): **0** em dashes. Clean.
- `src/app` + `src/components`: 347 occurrences, but **all sampled hits are in code
  comments / JSDoc**, not JSX text or string literals. Representative (all comments):
  `sign-up.tsx:184`, `audit.tsx:225`, `formats.tsx:425`, `secondb.tsx:522`,
  `settings.tsx:404`, `_layout.tsx:133`, `DeepSpaceDock.tsx:2`,
  `SecondbStatusHeader.tsx:2`, `NavGraph.tsx:179/1692/1995`, `graph-bits.tsx:23/131`,
  `LoadingScreen.tsx:80`. **No user-visible em dash found.** (Comments are out of the
  DESIGN.md "UI strings" rule, but the high count argues for a lint guard so none leak
  into JSX.)

### C3. Forbidden clinical lexicon — **0 in UI strings / locales**

Terms from `src/lib/safety/lexicon.ts` (`FORBIDDEN_TERMS`): mental health, therapy,
counseling, diagnosis, treatment, healing, cure / 정신건강, 심리치료, 심리상담, 치유.

| Term | Raw hits | Real UI/locale violations |
|---|---|---|
| mental health / therapy / diagnosis / treatment / healing | 3–5 each | **0** — all in `src/lib/**/__tests__/*` fixtures (CI guard tests) and the iden FORBIDDEN arrays. |
| cure | 48 | **0** — substring matches in `secure`/`procurement`/`cured`; only standalone `cure` is a `wiki/__tests__` fixture. |
| 정신건강 / 심리치료 / 심리상담 / 치유 | 3–4 each | **0** — test fixtures + allowlisted hotline-label defs. |

No forbidden term reaches a `locales/*.json` value or a screen string. CI lexicon guard
appears effective.

### C4. Legacy residue — **HIGH; real, in live code**

| Pattern | Hits (app+components+locales) | Live? | Representative |
|---|---|---|---|
| `gameboy` | 262 | mixed | Mostly `import { androidElevation } from "@/lib/theme/gameboy-tokens"` across most screens (sanctioned alias file) + `import { gameboy, pixelShadowStyle }` in `capture.tsx:42`. The token file is sanctioned; the naming is legacy. Flag the direct `gameboy.*` style usage (capture). |
| `village` / 마을 | 297 / 17 | **yes** | `@/lib/village-ui` imported by live screens: `account.tsx:31` (`VILLAGE_UI`), `+not-found.tsx:9` (`CORE_VILLAGE_UI`), `import.tsx:14`, `sign-in.tsx:36` (comment). `account.tsx:225` passes `island={VILLAGE_UI.relation.island}`. Legacy worldview leaking into canon screens. |
| `island` / `IslandArt` | 135 | **yes** | `IslandArt` art component used live: `core-brain.tsx:38,189,225` (`<IslandArt id="core" size={140}/>`), `capture.tsx:40` (`ShardArt from IslandArt`). Legacy-named art on canonical core-brain. |
| `phytoncide` | 0 | — | Clean (deprecated token file not referenced in app/components). |
| `brain.?trinity` | 3 | check | Few hits; spec also uses "Brain-Trinity식" phrasing for persona. `/trinity` route ("내 영역" 4-domain dashboard) is canon-renamed but the word lingers. |
| `mascot` | 9 | yes (neutral) | `index.tsx:470-739` uses `presence.mascot` as internal state key (`"sleep"/"idle"`) + `styles.mascotSlot`. Internal naming, not a forbidden cartoon mascot. Low priority. |
| `robot` | 1 | no | Single label variable; no purple-robot sprite. Clean. |

**Tier-name finding (notable).** `src/app/plans.tsx` + `locales/{en,ko}/plans.json` ship
tiers **Free / Soma / Cortex / Brain** (`plans.json` `name` values). Neither the
ROUTE_CHECKLIST canon (별바라기 / 항해자 / 북극성) nor the legacy Free/Plus/Pro — but **"Free"
persists as a tier label** and appears across `deepspace.json:134/246/256`, `capture.json`,
`ops.json`, `consent.json`. The checklist's expected plan names (별바라기/항해자/북극성) are
**absent**. Copy/naming mismatch to resolve before the plans-screen audit.

### C5. Glassmorphism / pill / left-border — **near-clean**

| Pattern | Count | Verdict |
|---|---|---|
| blur / BlurView / backdropFilter | 11 | **0 real** — all are `onBlur` handlers (`Input.tsx`, `surfaces.tsx`, `capture.tsx:1846`) or comments. No glassmorphism. |
| `borderRadius: 9999/999` pill | 0 | None applied as a chip radius. `deepSpaceRadii.pill: 999` is defined in tokens but unused as a chip. Clean. |
| `borderLeft` | 4 | `SecondbStatusHeader.tsx` (x2, `borderLeftWidth: 1` divider) and `AdvisorFollowupNote.tsx:97-98` (`borderLeftWidth: 3`, `borderLeftColor: semantic.brand`). The latter is the sanctioned 3px yellow-zone rephrase-hint border; confirm color maps to zone, else flag. 1px status-header divider is low risk. |

---

## PART D — PER-ROUTE CODE NOTE

`gate` = redirects to `/sign-in` or `/complete-profile` when unauthed (or sits under the
`_layout` IntroGate). `kind`: screen / redirect / preview.

| Route | Source file | Renders | Title / primary CTA | Gate | Kind |
|---|---|---|---|---|---|
| /sign-in | `(auth)/sign-in.tsx` | inline (552 ln) | 로그인 / [로그인][회원가입][소셜] | public | screen |
| /sign-up | `(auth)/sign-up.tsx` | inline (499 ln) | 회원가입 / DOB minor gate + 동의 / [가입] | public | screen |
| /reset-password | `(auth)/reset-password.tsx` | inline (258 ln) | 비밀번호 재설정 / [메일 보내기] | public | screen |
| /complete-profile | `(auth)/complete-profile.tsx` | inline (298 ln) | 프로필 완성 / [시작하기] | **gated** | screen |
| /onboarding | `onboarding.tsx` | inline (247 ln) | 첫 입력 / [첫 기록 담기][다음] | gated | screen |
| /ttfv | `ttfv.tsx` | `TTFVScreen` | 첫날 한 컷 / [맞아요][조금 달라요] | marks-seen | screen |
| /index | `index.tsx` | inline (1041 ln) | 별자리 홈 (북극성+7별, 큰 세컨비 head) | gated | screen |
| /core-brain | `core-brain.tsx` | inline (544 ln) | 북극성·소울 코어 / [근거 보기] (uses `IslandArt`) | gated | screen |
| /persona | `persona.tsx` | inline (866 ln) | 지금의 나 (Big Five) / [다시 검사][측정 이어가기] | gated | screen |
| /big-five | `big-five.tsx` | inline (538 ln) | Big Five 상세 / [재검사] | gated | screen |
| /mbti | `mbti.tsx` | `Redirect -> /persona` | (n/a) | — | **redirect** |
| /attachment | `attachment.tsx` | inline (511 ln) | 관계·애착 / [다시 입력] | gated | screen |
| /esm | `esm.tsx` | inline (545 ln) | 리듬(ESM) / [지금 기록] | gated | screen |
| /interview | `interview.tsx` | inline (796 ln) | AI 반복 인터뷰 / [답변 제출][그만하기] | gated | screen |
| /audit | `audit.tsx` | inline (596 ln) | 라이프 오딧 / 영역 drilldown | gated | screen |
| /capture | `capture.tsx` | inline (2180 ln) | 담기 (5모드) / [담기] (uses `gameboy.*`, `ShardArt`) | gated | screen |
| /secondb | `secondb.tsx` | inline (895 ln) | 세컨비 대화 / [전송][공상 모드] | gated | screen |
| /jarvis | `jarvis.tsx` | `Redirect -> /secondb` | (params passthrough) | — | **redirect** |
| /trends | — | — | **NO FILE** | — | **missing** |
| /review | `review.tsx` | inline (159 ln) | 점검 (propose->ratify) | public | screen |
| /insights | `insights.tsx` | inline (349 ln) | 인사이트(주간) | gated | screen |
| /digest | — | — | **NO FILE** | — | **missing** |
| /records | `records.tsx` | inline (372 ln) | 기록 보관소 | gated | screen |
| /record/[id] | `record/[id].tsx` | dynamic | 기록 상세 | (dyn) | screen |
| /inbox | `inbox.tsx` | inline (866 ln) | 정리함(triage) | gated | screen |
| /research | `research.tsx` | inline (299 ln) | 연결 찾기 | gated | screen |
| /wiki | `wiki.tsx` | inline (1415 ln) | 지식(RAG) | gated | screen |
| /journal | `journal.tsx` | `Redirect -> /capture` | (n/a) | — | **redirect** |
| /ops | `ops.tsx` | inline (500 ln) | 비서 추천 홈 | gated | screen |
| /reading | `reading.tsx` | `ReadingScreen` (ops) | 독서·학습 | (ops) | screen |
| /milestones | `milestones.tsx` | `MilestonesScreen` (ops) | 커리어·학습 목표 | (ops) | screen |
| /ledger | `ledger.tsx` | `LedgerScreen` (ops) | 재정 점검 | (ops) | screen |
| /side-project | `side-project.tsx` | `SideProjectScreen` (ops) | 사이드 프로젝트 | (ops) | screen |
| /meals | `meals.tsx` | `MealsScreen` (ops) | 식단 | (ops) | screen |
| /focus | `focus.tsx` | `DeepSpaceFocusScreen` | 일일 집중 타이머 | (ds) | screen |
| /trinity | `trinity.tsx` | inline (369 ln) | 내 영역(4영역) ("trinity" name lingers) | gated | screen |
| /graph | `graph.tsx` | `DeepSpaceGraphDesignScreen` | 노드 그래프 | (ds) | screen |
| /iden | `iden.tsx` | inline (178 ln) | IDEN 내보내기/뷰어 | gated | screen |
| /formats | `formats.tsx` | inline (519 ln) | 내보내기 형식 | gated | screen |
| /import | `import.tsx` | legacy OR `DeepSpaceImportScreen` (`isDeepSpaceUI`) | 외부 가져오기 (uses `VILLAGE_UI`) | gated | screen |
| /integrations | `integrations.tsx` | `DeepSpaceIntegrationsScreen` | 앱 연동 | (ds) | screen |
| /data | `data.tsx` | inline (138 ln) | 내 데이터 리뷰 / -> `/import` | gated | screen |
| /growth | `growth.tsx` | `WeeklyGrowthScreen` | 나의 변화(주간) | (ds) | screen |
| /imagine | `imagine.tsx` | inline (219 ln) | 공상 (legacy node, vestigial dreamPink pulse) | public | screen |
| /discover | `discover.tsx` | `DeepSpaceDiscoverScreen` (`isDeepSpaceUI`) | 탐색 | (ds) | screen |
| /account | `account.tsx` | inline (397 ln) | 나(계정 허브) (uses `VILLAGE_UI`) | gated | screen |
| /profile | `profile.tsx` | inline (472 ln) | 프로필 편집 | gated | screen |
| /settings | `settings.tsx` | inline (978 ln) | 설정 (로그아웃 위치) | gated | screen |
| /theme | `theme.tsx` | inline (197 ln) | 옵션(테마·글꼴) | gated | screen |
| /manual | `manual.tsx` | inline (358 ln) | 매뉴얼 | public | screen |
| /museum | — | — | **NO FILE** (settings links to it per spec) | — | **missing** |
| /plans | `plans.tsx` | inline (189 ln) | 요금제 (Free/Soma/Cortex/Brain — NOT canon names) | public | screen |
| /permissions | `permissions.tsx` | inline (156 ln) | 권한 | public | screen |
| /privacy | `privacy.tsx` | inline (244 ln) | 개인정보·약관·동의 | gated | screen |
| /support | `support.tsx` | inline (118 ln) | 지원·공지 | gated | screen |
| /oauth-callback | `(auth)/oauth-callback.tsx` | inline (87 ln) | OAuth 콜백 -> /index | public | callback |

Extras (not in checklist): `/reminders`, `/srs`, `/import-hub` (live ops/import screens);
`/deepspace-home`, `/deepspace-hub`, `/deepspace-flowmap`, `/deepspace-preview` (dev
previews — exclude from user audit or hide before ship).

---

## BLOCKERS / PRIORITIES (summary)

1. **Dead checklist routes** `/trends`, `/digest`, `/museum` (and standalone `/jot`) —
   no route file, no nav. If `/settings -> museum` is wired, it is a dead link.
2. **Plan-name mismatch** — `plans.tsx` ships Free/Soma/Cortex/Brain; checklist canon is
   별바라기/항해자/북극성. "Free" tier label is spread across many locale files.
3. **Legacy worldview residue in canon screens** — `VILLAGE_UI` (account, import,
   +not-found), `IslandArt`/`ShardArt` (core-brain, capture), direct `gameboy.*` styling
   (capture). Naming/visual leakage to reconcile against deep-space canon.
4. Clean: hex literals (0), em dash in strings (0), forbidden lexicon (0),
   glassmorphism (0), pill chips (0).

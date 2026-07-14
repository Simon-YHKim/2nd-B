# CLAUDE.md — 2nd-Brain project instructions

Project-specific guidance for Claude Code sessions in this repo.

## Project context

- **What**: 2nd-Brain — *AI 시대 가장 가치있는 자산 = 나 자신* 을 데이터로 축적하고 개인 비서로 키우는 플랫폼. 세 축: (1) 알아가기 · (2) 개인 비서 기반 · (3) 공상 → 구체화. Build with Gemini XPRIZE (Education & Human Potential) 출품작.
- **Deadline**: 2026-08-17 06:00 KST.
- **Stack**: React Native + Expo SDK 56, TypeScript strict, Supabase (Postgres + Auth), Gemini via `@google/genai`, EAS Build, GitHub Actions.
- **Web deploy target — GitHub Pages, NOT Vercel.** `.github/workflows/web-deploy.yml` pushes the
  Expo static export to the `gh-pages` branch; live at <https://simon-yhkim.github.io/2nd-B/>, and
  `app.json` pins `baseUrl: "/2nd-B"` to that subpath. A Vercel project is still connected and
  builds PRs, but nothing ships from it and the `baseUrl` makes a Vercel root deploy wrong. Root
  `vercel.json` is an unused Sprint-0 leftover. Do not treat Vercel as the web target.
- **Solo build**: Simon Kim. Evenings + weekends only.
- **Vision**: `docs/VISION.md` (캐치프레이즈 + 3축 모델). 모든 새 기능은 어느 축에 속하는지 PR 설명에 명시.
- **Master blueprint**: `docs/ARCHITECTURE.md`. Hard constraints C1~C12: `docs/CONSTRAINTS.md`.

## QA test account — AI agents: sign in and test freely

A shared test account is **committed** so any AI agent (local, cloud, or headless) can
sign in and exercise the real app during QA. **Reuse it — do not create another.**

- **Credentials**: `.env.test` (committed at repo root) → `QA_TEST_EMAIL` / `QA_TEST_PASSWORD`.
- **Account**: `qa.ai.b18807@example.com` — email/password sign-in, free tier, adult, `judge_mode=false`, RLS-isolated (only its own rows).
- Disposable and non-secret (the Supabase anon key is already public). Revoke anytime by deleting the user in Supabase Auth. Real secrets (service_role, API keys, `.env`) still never go in git.
- To test paywalled features, set `EXPO_PUBLIC_FORCE_TIER` in `.env` (e.g. `brain` unlocks everything) — the account itself stays free.

## Canonical concept & direction (read first)

The concept and direction is **deep-space constellation** (a character-led home shell). The
canonical concept SoT is **`docs/PRD.md` (Draft v3)**; the detailed model spec is
**`docs/CONSTELLATION-DESIGN.md`**; **`docs/CONCEPT.md`** names canonical vs legacy. Read these
before any concept, IA, or visual decision. Canonical model = **3-layer 별자리**: A) 7 DOMAIN
stars (커리어·재정·성장·관계·건강·휴식·담아내기 = input), B) the psychological constructs in
`stars.ts` (the hidden validation layer behind the output — NOT home stars), C) 북극성 (Polaris)
= the aggregate output / persona synthesis (drop the "Soul Core" name) + the L1~L5 brightness
ladder + propose->ratify.

**LEGACY (rollback skin only, never the reference for new work):** the gameboy track, the
*Cosmic Pixel Graph Village* system, *phytoncide* tokens, *Brain Trinity* naming, **the "Soul
Core" name, the 5 Pattern Core layer + Pattern Tesseract, the village graph `/graph` +
`/core-brain` + `/trinity`, the v3 tesseract art, the character voices (아치/가디/루루/모모/루미),
and the old 4-tier Visual Tier node-names** (Soul Core 128px / Pattern Core x5 / snowflake /
crystal). Preserved behind `EXPO_PUBLIC_UI=legacy`; superseded concept docs remain in git history.

## The 12 hard constraints

Never weaken these. They're enforced at code/schema/CI level:

| ID | Rule |
|---|---|
| C1 | All LLM calls through `src/lib/llm/gemini.ts`. ESLint blocks other LLM SDKs. |
| C2 | `@google/genai` with `vertexai: true` when `EXPO_PUBLIC_USE_VERTEX=true`. |
| C3 | `ai_audit_log` INSERT on every Gemini call (including mock + crisis). |
| C4 | `revenue_events` has `month_bucket` + `is_related_party` + `customer_relation_type`. |
| C5 | `testimonials.consent_given_at NOT NULL`. |
| C6 | Judge mode auto-flag for `@xprize.org`, `@devpost.com`, `@hacker.fund`. |
| C7 | i18n EN ↔ KO key parity. EN is canonical. |
| C8 | `knowledge_sources` requires DOI/URL + verification pair. |
| C9 | `classifyInput()` runs before any LLM call. Red zone short-circuits. |
| C10 | Age-tiered sign-up: 14-17 self-consent minors and adult users register direct; under-14 needs verifiable guardian consent (PIPA §22-2/COPPA). Phased rollout; see docs/CONSTRAINTS.md. |
| C11 | Support SLA = 2 business days (KST). |
| C12 | README "Pre-existing assets used" section per rulebook §04. |

When uncertain whether a change weakens a constraint, run `npm run check:constraints`.

## Vocabulary policy (blueprint §3)

This is **not** a mental-health, therapy, or wellness app. Avoid clinical terminology in all surfaces (code, UI strings, comments, docs).

- **Forbidden** (CI-enforced via `scripts/check-forbidden-lexicon.ts`): mental health, therapy, counseling, diagnosis, treatment, healing, cure, 정신건강, 심리치료, 심리상담, 치유.
- **Use instead**: self-understanding, growth, reflection, self-knowledge, 자기 이해, 성장.

The single source of truth for both runtime classification and CI scan is `src/lib/safety/lexicon.ts`.

## Design system

> **ACTIVE MIGRATION (2026-07-01) — rev2 PRD v2.0 → Material 3.** Approved direction: the app is
> migrating from the deep-space **cosmic-pixel** visual system to **Material 3 + deep-space**. The
> program plan + gap analysis is `docs/REV2-MIGRATION.md` (the SoT for this migration). Concept is
> UNCHANGED (별자리 · 북극성 · 북두칠성 7별 · 정직한 밝기 L1~L5 · propose→ratify · 세컨비); per PRD v2.0
> "레이아웃 자유, 의미 고정" — feature purpose/interaction/data-flow/safety invariants + the 별자리 홈
> 골격 + 세컨비 머리 에셋 are fixed. Deltas: pixel-font chrome (Galmuri/Press Start) → Roboto/Roboto
> Mono + Pretendard; azure primary + violet tertiary; deep-space bg global; 세컨비 3 personas
> (2nd-B/메타비/트위비); domain 6 오락 → 휴식. **Until a screen is migrated to M3, the current
> deep-space rules below still apply to it.** `EXPO_PUBLIC_UI=legacy` cosmic-pixel stays the rollback.

**Read `docs/CONCEPT.md` (concept/direction) and `DESIGN.md` (visual discipline) before any visual or UI decision.** DESIGN.md's Cosmic Pixel Graph Village is the legacy skin; deep-space visuals use `deepSpace.*` tokens + `docs/deep-space-nav-contract.md`. Font, color, spacing, and aesthetic rules are defined there.

**Canonical reference design (always honor): `design/proto_rev2/reference-app/`.** The rev2/M3
canon is the reference app there — `m3-theme.css` (tokens) plus `data/index.json` +
`data/{app,core,screens}/*.json` (per-screen spec). It is not a document you read and reproduce by
hand: **the code already consumes it.** `src/lib/canon/` loads those JSONs, 13 source files import
them, and `src/lib/canon/__tests__/canon.test.ts` + `canon-tokens.test.ts` fail the build if the
code drifts from the canon. So a visual change means changing the canon JSON and the code together,
not eyeballing a mockup.

- `design/proto_rev2/reference-app/README.md` — how the reference app is structured.
- `design/proto_rev2/reference-app/data/index.json` — which screen spec maps to which route.

**STALE — do not use as the reference for new work:** `design/*.dc.html` and the `docs/ui-audit/`
trio (`DESIGN_INDEX.md` / `SCREEN_TREE_SPEC.md` / `CLONE_PROTOCOL.md`). Those are a pre-M3 snapshot
(2026-06-24) from the deep-space cosmic-pixel era, superseded by the reference app above. They are
kept for history. `SCREEN_TREE_SPEC.md`'s route table in particular is badly out of date (it lists
40 routes; the app has 85).

- Do not introduce hex literals in components. Always go through `semantic.*` from `src/lib/theme/tokens.ts`.
- Do not add glassmorphism, pill chips, or em dashes in UI strings. Gradients are allowed only within the deep-space cyan/soul identity via `deepSpaceGradients` (`src/lib/theme/tokens.ts`); off-palette or decorative gradients stay forbidden. See DESIGN.md "Color rules".
- Do not deviate from `DESIGN.md` without explicit user approval.
- In QA mode, flag any code that doesn't match `DESIGN.md`.

## Android Native QA Guidelines

**CRITICAL**: Always read and adhere to `ANDROID_QA_GUIDELINES.md` before making any structural, UI, lifecycle, or data management changes.
This document contains hard-learned prevention measures for Android runtime crashes (OOM, SVG rendering locks, AsyncStorage 2MB limits) and severe UX bugs (Shine-through z-index inversion, hardware BackHandler leaks). Failure to follow it will break the Android build.

## Verification

`npm run verify` runs the full gauntlet: lint + type-check + i18n + lexicon + legal-review +
LLM boundary + constraints + em dash + anti-anthro + mascot-voice + **require cycles** + jest.

Always run `npm run verify` before pushing. CI calls `npm run verify` directly (not a copy of the
steps), so a new check added there is automatically enforced in CI.

**`check:cycles` is a zero-tolerance gate, not a ratchet.** The repo has 0 runtime require cycles
and must keep it that way: a cycle lets a component evaluate before `lib/theme/m3`, and 35 files
still dereference `m3.*` at module scope inside `StyleSheet.create` — so one cycle re-arms all of
them. That is exactly what shipped to users on 2026-07-03 (#711 `[ota]`, live redbox on
`/settings`). Note the gate excludes `import type` edges: they are erased at compile time and
cannot cycle at runtime, which is why `madge --circular` reports 10 while the true count is 0.

## Skill routing (SimonK Stack / gstack)

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

- Product ideas/brainstorming → `/office-hours`
- Strategy/scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs/errors → `/investigate`
- QA / testing site behavior → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Visual polish → `/design-review`
- Ship / deploy / PR → `/ship` or `/land-and-deploy`
- Security audit → `/cso`
- Save progress → `/checkpoint` (snapshot work state)
- Resume context → `/checkpoint` (resume) or `/context-guardian` (recovery mode after disconnect)


## Visual Tier System — always enforce (Simon standing rule)

The app uses the **3-layer constellation hierarchy** (canonical = PRD §4.1 +
`docs/CONSTELLATION-DESIGN.md`). ALL visual changes must respect it. The OLD 4-tier node names
(Soul Core 128px / Pattern Core ×5 / snowflake / crystal) are **DEPRECATED** — the tier
*principle* (one dominant root, sub-nodes recede) carries over; the *names* do not.

| Layer | Node | Brightness/Glow | Notes |
|------|------|--------------|-------|
| C (출력) | 북극성 (Polaris) | Full brightness, max glow bloom | Root/hero — aggregate of the 7 domain stars, must be clearly dominant. Internal key `soulCoreBrightness`, display "북극성" |
| A (입력) | 북두칠성 7 도메인 별 | baseline magnitude × domain L1~L5 | The 7 life-domain stars (커리어·재정·성장·관계·건강·휴식·담아내기). Brighter as the domain fills |
| link | cyan Pattern Link | Subtle, recedes | All links = cyan (Big Dipper shape + 2-star pointer → 북극성) |

(Layer B = the psychological constructs in `stars.ts`, the hidden validation layer behind
북극성 — NOT rendered as stars.)

**Rules:**
- Never make a domain star (layer A) look as large/bright as 북극성 (layer C)
- In drilldown (focused) view: tapped domain star = promoted near 북극성; others recede (scale↓, desaturation, opacity↓)
- Link colors: ALL links = cyan (no green trunks, no violet leaves)
- Brightness = "how much of this domain I know" (DIKW L1~L5); depth falloff and star brightness must not contradict each other
- This hierarchy applies to size, glow intensity, opacity, animation amplitude

## Information Density — one message + one graphic per screen (Simon standing rule)

Too much at once is as bad as overlap. Every screen earns attention with ONE thing.

- **One core message per screen** — strip the rest of the text/labels.
- **One graphic supports it** — the visual IS the explanation. If you need explanatory text, the graphic failed → change the graphic, not add copy.
- **Progressive disclosure** — detail appears only AFTER a tap/drilldown. First screen = the lure, detail = the catch.
- Pairs with the touch rule (O-7): one touch should SIMPLIFY the screen, never add an overlapping layer (use a screen transition or bottom sheet, never a modal over the node). Back lives in exactly one place.

## Worktrees & branches (Simon standing rule)

The canonical checkout is `C:\2ndB` on `main`. ALL git worktrees live INSIDE this
repo under `.worktrees/<name>` (gitignored). Never create a worktree as a sibling
folder (e.g. `C:\2ndB-dev`) or under `C:\Coding Infra\_worktrees\`. This applies to
every agent: Claude, Codex, Antigravity, Grok.

- Create from the repo root: `git worktree add .worktrees/<name> -b <branch>`.
  Remove: `git worktree remove .worktrees/<name>`. Move an existing one in:
  `git worktree move <old-path> C:/2ndB/.worktrees/<name>`.
- Share the install: symlink the worktree's `node_modules` to the canonical
  `C:\2ndB\node_modules` rather than a per-worktree `npm ci`.
- Tooling already excludes `.worktrees/` (gitignore, jest, metro, tsconfig,
  eslint). Keep those excludes: they stop the nested copies from polluting
  `npm run verify` and the Metro bundler.

## What never to do in this repo

- Commit `.env`. (gitignored — verify before staging.)
- Create git worktrees outside `.worktrees/` (no sibling folders, none under
  `C:\Coding Infra\_worktrees\`). See **Worktrees & branches** above.
- Push to `main` directly. Always PR.
- Use `git rebase -i` or `git push --force` without explicit user confirmation.
- Add a dependency without checking the free-tier impact (blueprint §5 promises $0/mo).
- Skip the safety classifier in any LLM call path.
- Stage `.claude/settings.local.json` (per-user, gitignored).

<!-- context-guardian-rules:v1 -->
## Context Guardian Rules (auto-inserted)

### 작업 범위 제한
- 한 세션에서 수정 파일 최대 5 개
- 한 번에 하나의 기능/파일 단위로만 작업
- 작업 완료 즉시 git commit 후 세션 종료 권고

### 파일 읽기 제한
- node_modules/, .next/, dist/, .git/ 절대 읽지 않기
- 목적 없는 디렉토리 스캔 금지
- 대용량 파일 (1000 줄 이상) 전체 읽기 금지 — Read offset+limit 사용

### 작업 요청 방식
- 광범위 요청은 작은 단위로 분해 후 사용자 확인
  예: "Auth 전체 마이그레이션" → "어떤 파일부터 시작할까요?"
- Plan 모드로 먼저 계획 수립 → 승인 후 실행

### 컨텍스트 보호
- 80% 도달 시 SESSION_RECOVERY.md 생성 + 새 세션 전환 권고
- 90% 도달 시 즉시 작업 마무리 + 새 세션 강제


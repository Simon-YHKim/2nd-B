# AGENTS.md — 2nd-Brain project instructions

Project-specific guidance for Codex sessions in this repo.

## Project context

- **What**: 2nd-Brain — *AI 시대 가장 가치있는 자산 = 나 자신* 을 데이터로 축적하고 개인 비서로 키우는 플랫폼. 세 축: (1) 알아가기 · (2) 개인 비서 기반 · (3) 공상 → 구체화. Build with Gemini XPRIZE (Education & Human Potential) 출품작.
- **Deadline**: 2026-08-17 06:00 KST.
- **Stack**: React Native + Expo SDK 56, TypeScript strict, Supabase (Postgres + Auth), Gemini via `@google/genai`, EAS Build, Vercel (web), GitHub Actions.
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

The concept and direction is **deep-space** (a character-led home shell) plus the
synthesis memo `2ndb-thought-organization-synthesis.html`. The one place that states
what is canonical vs legacy is **`docs/CONCEPT.md`** — read it before any concept,
IA, or visual decision. Canonical model: 북극성(Soul Core) + 북두칠성 7별
(self-understanding lenses) + the L1~L5 brightness ladder + propose->ratify.

**LEGACY (rollback skin only, never the reference for new work):** the gameboy track,
the *Cosmic Pixel Graph Village* system, *phytoncide* tokens, *Brain Trinity* naming,
and the fixed village node-names in the Visual Tier System below (Soul Core / Pattern
Core x5 / snowflake / crystal). Preserved behind `EXPO_PUBLIC_UI=legacy`; superseded
concept docs were cleaned up and remain in git history.

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

**Read `docs/CONCEPT.md` (concept/direction) and `DESIGN.md` (visual discipline) before any visual or UI decision.** DESIGN.md's Cosmic Pixel Graph Village is the legacy skin; deep-space visuals use `deepSpace.*` tokens + `docs/deep-space-nav-contract.md`. Font, color, spacing, and aesthetic rules are defined there.

- Do not introduce hex literals in components. Always go through `semantic.*` from `src/lib/theme/tokens.ts`.
- Do not add gradients, glassmorphism, pill chips, or em dashes in UI strings.
- Do not deviate from `DESIGN.md` without explicit user approval.
- In QA mode, flag any code that doesn't match `DESIGN.md`.

## Android Native QA Guidelines

**CRITICAL**: Always read and adhere to `ANDROID_QA_GUIDELINES.md` before making any structural, UI, lifecycle, or data management changes.
This document contains hard-learned prevention measures for Android runtime crashes (OOM, SVG rendering locks, AsyncStorage 2MB limits) and severe UX bugs (Shine-through z-index inversion, hardware BackHandler leaks). Failure to follow it will break the Android build.

## Verification

`npm run verify` runs the full gauntlet: lint + type-check + i18n + lexicon + LLM boundary + constraints + jest.

Always run `npm run verify` before pushing. CI runs the same suite plus `supabase-dry-run.yml`.

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

The app uses a 4-tier visual hierarchy. ALL visual changes must respect this:

| Tier | Node | Size | Opacity/Glow | Notes |
|------|------|------|--------------|-------|
| 1 | Soul Core | 128px | Full brightness, max glow bloom | Root/hero — must be clearly dominant |
| 2 | Pattern Core (×5) | 82px | High brightness, strong glow | Secondary nodes, each color-coded |
| 3 | Pattern Data (snowflake) | 38px | Medium opacity, softer glow | Blue snowflakes, visible in overview |
| 4 | Pattern Link (crystal) | 30px | Lower opacity, subtle | Sub-nodes, recede in overview |

**Rules:**
- Never make tier-2 nodes look as large/bright as tier-1
- Never make tier-3/4 nodes compete visually with tier-2
- In drilldown (focused) view: selected core tier-2 = promoted near tier-1; others recede (scale↓, desaturation, opacity↓)
- Link colors: ALL links = cyan (no green trunks, no violet leaves)
- Depth falloff and snowflake brightness must not contradict each other
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
- Stage `.Codex/settings.local.json` (per-user, gitignored).

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


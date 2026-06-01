# CLAUDE.md — 2nd-Brain project instructions

Project-specific guidance for Claude Code sessions in this repo.

## Project context

- **What**: 2nd-Brain — *AI 시대 가장 가치있는 자산 = 나 자신* 을 데이터로 축적하고 개인 비서로 키우는 플랫폼. 세 축: (1) 알아가기 · (2) 개인 비서 기반 · (3) 공상 → 구체화. Build with Gemini XPRIZE (Education & Human Potential) 출품작.
- **Deadline**: 2026-08-17 06:00 KST.
- **Stack**: React Native + Expo SDK 56, TypeScript strict, Supabase (Postgres + Auth), Gemini via `@google/genai`, EAS Build, Vercel (web), GitHub Actions.
- **Solo build**: Simon Kim. Evenings + weekends only.
- **Vision**: `docs/VISION.md` (캐치프레이즈 + 3축 모델). 모든 새 기능은 어느 축에 속하는지 PR 설명에 명시.
- **Master blueprint**: `docs/ARCHITECTURE.md`. Hard constraints C1~C12: `docs/CONSTRAINTS.md`.

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
| C10 | Age-tiered sign-up: 18+ and 14-17 self-consent register direct; under-14 needs verifiable guardian consent (PIPA §22-2/COPPA). Phased rollout; see docs/CONSTRAINTS.md. |
| C11 | Support SLA = 2 business days (KST). |
| C12 | README "Pre-existing assets used" section per rulebook §04. |

When uncertain whether a change weakens a constraint, run `npm run check:constraints`.

## Vocabulary policy (blueprint §3)

This is **not** a mental-health, therapy, or wellness app. Avoid clinical terminology in all surfaces (code, UI strings, comments, docs).

- **Forbidden** (CI-enforced via `scripts/check-forbidden-lexicon.ts`): mental health, therapy, counseling, diagnosis, treatment, healing, cure, 정신건강, 심리치료, 심리상담, 치유.
- **Use instead**: self-understanding, growth, reflection, self-knowledge, 자기 이해, 성장.

The single source of truth for both runtime classification and CI scan is `src/lib/safety/lexicon.ts`.

## Design system

**Always read `DESIGN.md` before making any visual or UI decision.** All font choices, colors, spacing, and aesthetic direction are defined there.

- Do not introduce hex literals in components. Always go through `semantic.*` from `src/lib/theme/tokens.ts`.
- Do not add gradients, glassmorphism, pill chips, or em dashes in UI strings.
- Do not deviate from `DESIGN.md` without explicit user approval.
- In QA mode, flag any code that doesn't match `DESIGN.md`.

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

## What never to do in this repo

- Commit `.env`. (gitignored — verify before staging.)
- Push to `main` directly. Always PR.
- Use `git rebase -i` or `git push --force` without explicit user confirmation.
- Add a dependency without checking the free-tier impact (blueprint §5 promises $0/mo).
- Skip the safety classifier in any LLM call path.
- Stage `.claude/settings.local.json` (per-user, gitignored).

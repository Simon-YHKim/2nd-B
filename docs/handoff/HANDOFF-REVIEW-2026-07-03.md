# Handoff-Docs Review — 2nd-Brain

**Scope:** `docs/HANDOFF.md` (living handoff log) + `docs/handoff/` reference set (10 files).
**Date:** 2026-07-03 · **Branch:** `claude/handoff-docs-review-vtnuuv` (off `main` @ `30ac671` / PR #739).
**Method:** 4 parallel audit dimensions (structure · factual accuracy · staleness · cross-section consistency) + orchestrator cross-checks against the live repo.
**Verification mode:** static only — `node_modules` is absent in this environment, so `npm run verify` / eslint / jest / tsx could not run. Findings are grep / file-existence / source-read based.

---

## Executive summary

- **The handoff is factually sound where it can be checked.** Every referenced file path in the recent sections exists, the cited symbols behave as described, and `package.json`'s `verify` pipeline names only real scripts. **No misinformation was found** — the defects are documentation *hygiene* and *staleness*, not wrong facts.
- **Top structural defect: the `## Latest` marker had accumulated to 31 sections** (plus 4 `## Earlier`), when the log's own rule (line 3, "가장 최신 섹션이 맨 위") allows exactly one. In places the labels actively inverted recency (a `06-02` block *labeled* "Latest" sat **below** `06-03`/`06-04` blocks labeled "Earlier"). This defeats the one navigation aid in a ~214k-char doc. **Fixed in this PR.**
- **Highest-impact staleness lives in `docs/handoff/` design references.** `design-context.md`, `design-system.html`, and `app-feature-map.html` present the **legacy** cosmic-pixel / Soul Core / Pattern-Core / mascot / Game Boy system as the design **"정본 / source-of-truth"**, with **zero** legacy markers and **no** mention of the canonical 별자리 · 북극성 · 북두칠성 7별 or the active rev2 Material-3 migration — the inverse of current reality per `CLAUDE.md`. An agent handed one of those files would build the rollback skin. **Superseded banners added in this PR.**
- **Root cause of the marker sprawl is upstream** in the `simon-handoff` skill (repo `SimonK-stack`): it *prepends* a new `## Latest` block without stripping the previous one, so the count regrows ~1 per session. A one-time cleanup (this PR) is cosmetic unless that skill is patched — see **RD-6**.
- **A batch of safe, judgment-free fixes was applied**; everything needing a product/maintainer decision (archival cut-line, TOC, queue-letter namespacing, RAG-doc path reconciliation, `psychology-handoff.md` dedup) is **quarantined below and left untouched.**

---

## What this PR changed (safe, mechanical, content-preserving)

| Fix | File(s) | What |
|---|---|---|
| **SF-1** | `docs/HANDOFF.md` | Stripped 34 stale `## Latest`/`## Earlier` prefixes → plain dated headers, keeping `## Latest` on the single genuine newest block only (line 6). Verified: `## Latest` 31→1, `## Earlier` 4→0. No body content changed. Also resolves the em-dash vs double-hyphen split in those headers (L1). |
| **SF-3** | `docs/HANDOFF.md` | Demoted Sprint-0's ten numbered subsections `## N.` → `### N.` so they nest under `## Sprint 0 (historic)` instead of being top-level siblings. |
| **SF-4** | `docs/HANDOFF.md` | Inserted the missing `---` rule before the `2026-07-02 (오전 2차)` section (76 rules for 77 sections → now consistent). |
| **SF-7** | `docs/HANDOFF.md` | Corrected queue-J's OpsHomeScreen path `ops/kit.tsx` → `src/screens/deepspace/ops/screens.tsx` (verified location). |
| **SF-6** | `docs/handoff/design-context.md`, `design-system.html`, `app-feature-map.html` | Added a "SUPERSEDED — legacy skin" banner at the top of each, pointing to the current canonical docs. Non-destructive; the historical content is preserved. |

All five edits are inside files that are either not lexicon-scanned (`docs/handoff/**` is allow-listed) or add no forbidden vocabulary (`docs/HANDOFF.md` is scanned but the edits only strip prefixes / demote headings / fix a path). No CI-relevant surface changed.

---

## Findings by severity

### 🔴 HIGH

**H1 — 31 `## Latest` + 4 `## Earlier` markers; only one section is genuinely newest.** *(Reported independently by 3 of 4 dimensions.)*
`grep '^## Latest' = 31`, `'^## Earlier' = 4`. Only the top block (`2026-07-03 (오후)`) is newest; the rest span back to `2026-05-27`. Recency was actively inverted: `## Latest -- 2026-06-02` (was line 2388) sat below `## Earlier -- 2026-06-04` (2198). Within `07-03` alone, four sections carried "Latest" while two peers did not, and a "Latest"-labeled block sat below two unlabeled newer ones. The doc contradicts its own line-3 rule. → **Fixed (SF-1).** Durable fix is upstream (**RD-6**).

**H2 — `docs/handoff/` design references present the legacy system as the current "정본", unmarked.** *(Staleness.)*
- `design-context.md:3` "Self-contained design source-of-truth"; `:12` "Worldview — 5-layer model (canonical)"; `:17` `Soul Core` + Pattern Core ×5 (Archon/Relia/Lumen/Lumina/Momo); §3 mandates pixel fonts, §4 a "Game Boy" layer. `grep 별자리|북극성|북두칠성|polaris|material|rev2` → **none**.
- `design-system.html` `<title>… (Cosmic Pixel Graph Village)`; "세계관 5계층 … 정본"; deep-space demoted to an alt "트랙". Zero legacy markers.
- `app-feature-map.html` labels the 5-layer Soul Core worldview "정본" and lists legacy routes `/core-brain`, `/trinity` in the current nav (both LEGACY per `CLAUDE.md`, behind `EXPO_PUBLIC_UI=legacy`).
Every one of Soul Core / Cosmic Pixel / Pattern Core / mascot voices / gameboy is `CLAUDE.md`-classified **LEGACY (rollback only)**. → **Banners added (SF-6).** Full rewrite to the 별자리/M3 model, and marking the `/core-brain`·`/trinity`·`/graph` nav rows legacy-only, remain a maintainer content pass (**RD-5**).

### 🟠 MEDIUM

**M1 — RAG handoff points the KB seed at `db/seed/`, which does not exist (actual: `supabase/seed/`, 45 `.sql`).** *(Report-only — not auto-fixed.)*
`build-rag-wiki.md:35` is a "Handoff path → Actual path in this repo" reconciliation table; row 35 claims the *actual* path is `/db/seed/knowledge-sources-{slug}.sql`, but `db/seed` is missing and `supabase/seed/` holds the 45 seed files. `:81` ("add seed in `db/seed/`") and `psychology-handoff.md:5` repeat the dead path, while `build-rag-wiki-OUTPUTS.md` and `docs/research/psychology-handoff.md` already say `supabase/seed`. The set contradicts itself. **Not auto-fixed** because rows 34/36 map `supabase/migrations` → `db/migrations` similarly and the table appears to be a now-stale snapshot of a directory move; reconciling it correctly needs the seed-dir history, which is a maintainer call. → **RD-3.**

**M2 — No table of contents for a 77-section / ~214k-char document.** `grep '목차|table of contents|\[toc\]'` → 0. Best added *after* archival so it stays short. → **RD-1 / RD-2.**

**M3 — No archival: 5+ weeks (2026-05-25 → 07-03) in one working doc.** Includes 9 `06-01` sections, the legacy "Cosmic Pixel Graph Village" and "Soul Core v3" blocks. `docs/handoff/` is a natural archive home. Cut-line is a judgment call. → **RD-1.**

**M4 — Sprint-0's ten subsections used `##` instead of `###`.** → **Fixed (SF-3).**

**M5 — Queue letters `D`/`E` carry different meanings across same-day sessions.** `D` = "motivation 파이프 잔여 2종" (lines 149/275) vs "call-log 네이티브 트리거" (203); `E` = "plans 3티어" vs "고용24 연동". The newest block's "큐 D 입력에 반영" is ambiguous, and the motivation-pipe `D` silently vanishes from the newest queue table with no done/dropped note. Restructure, not a mechanical edit. → **RD-4.**

### 🟡 LOW

- **L1 — Header dash-style split** (`— ` ×24 vs `-- ` ×7, plus `Earlier` split). Dissolved by **SF-1** (those prefixes were removed). Note: this was never a CI issue — `check-no-emdash.ts` scans `locales/` only, not docs.
- **L2 — Missing `---` before the `2026-07-02 (오전 2차)` section.** → **Fixed (SF-4).**
- **L3 — Queue-J cited the wrong file for OpsHomeScreen** (`ops/kit.tsx`; actual `src/screens/deepspace/ops/screens.tsx:154`, barrel-exported, unrouted). The dead-code *claim itself is accurate.* → **Fixed (SF-7).** Note: the sibling `DeepSpaceDock` dead-code entry is nuanced — the component is actively imported by 6 files, so any dead code there is a specific internal render path, not the component; confirm before deletion.
- **L4 — `별가루 vs 조각` is resolved in the newer block but still listed open in the older `오전` block** (line 158 frames it as "전앱 통일 방향 결정 필요"; the newer block resolves it to a per-surface split at line 84 + #735). The older block also mis-frames the answer. → Left as-is; correcting a past-session decision block risks rewriting history — flagged for the maintainer (**RD-4**).
- **L5 — `psychology-handoff.md` exists in two diverged copies** — `docs/handoff/` (7,504 B) ≠ `docs/research/` (8,889 B, the fuller master). They also differ in the clinical-boundary disclaimer wording; because both live under lexicon-allow-listed dirs (`docs/handoff/**`, `docs/research/**`), the divergence is invisible to `check:lexicon`. → **RD-3** (pick a canonical copy, make the other a pointer).
- **L6 — "레퍼런스 7종" vs 10 files in `docs/handoff/`.** The count is *accurate for its referent* (6 HTML + `design-context.md` = 7, enumerated at line ~1975); the extra 3 (`build-rag-wiki*`, `psychology-handoff.md`) are a separate RAG handoff in the same folder. A reader `ls`-ing the dir sees 10 and may distrust the count. Optional clarity note; not a defect.
- **L7 — `design-legacy-timeline.html` / `methodology-*.html` are self-labeled historical** but their endpoint predates the rev2/별자리 pivot (`methodology-architecture.html` leads with the legacy "Brain Trinity" name). Low impact — they read as history. Optional footer.
- **L8 — Gate list + queue rows G/H/I/J duplicated near-verbatim across adjacent top sections** (gates at 31-32, 78-81, 153-160; queue G/I/J at 74-76 and 145-148). → **RD-4.**

### ℹ️ Informational (no fix needed)

- **Ordering is intact.** Day-level order is monotonically non-increasing (65 dated headers, no date regressions). Only *intra-day* sub-ordering is unverifiable (only 오후/오전 are timed) → **RD-4** proposes a timestamp convention.
- **Decision gates are tracked consistently.** `axis_estimate 과금`, `consent 문구`, `E` (plans), `F` (0.0.7 폰 QA) are marked open in every recent section that mentions them — no gate is resolved-then-relisted-as-open (the one exception is L4).
- **Apparent "contradictions" are correct-as-of-their-date snapshots**, not defects: `main HEAD c06c594b (#738)` (line 12) is behind the current `30ac671`/#739 exactly because #739 is the commit that added that block; the `#738` vs `#737` and "17 merges vs ~5 landed" gaps are the orchestrator-vs-dev role difference the doc states at line 8.
- **Lexicon gate context.** `check-forbidden-lexicon.ts` scans `docs/`, but `docs/handoff/**` and `docs/research/**` are allow-listed (they reference the policy vocabulary by definition). That is why the design refs and psychology handoffs — which contain clinical terms by nature — do not fail CI. `docs/HANDOFF.md` (root) is **not** allow-listed and *is* scanned; it is currently clean and this PR keeps it clean.

---

## Recommendations requiring a decision (NOT auto-applied)

- **RD-1 — Archival cut-line (M3/M2).** Move older sections into `docs/handoff/ARCHIVE-2026-05_06.md` with a one-line pointer, then add a short TOC. *Conservative:* cut at the `2026-06-16` boundary (keep the rev2 window live). *Aggressive:* keep only `2026-06-27 →` (≈ −77% length). Maintainer picks the window.
- **RD-2 — Table of contents.** Add only after RD-1 so it stays short; dates + anchors only.
- **RD-3 — Reconcile RAG-doc paths (M1) and dedup `psychology-handoff.md` (L5).** Update `build-rag-wiki.md` and `docs/handoff/psychology-handoff.md` to the real `supabase/seed/` layout, and pick one canonical `psychology-handoff.md` (the `docs/research/` copy is the fuller master) with the other a pointer, to stop future drift.
- **RD-4 — Queue + gate consolidation (M5, L4, L8).** Maintain ONE live queue + one live gate list at the top; namespace per-session letters (`D-오후` / `D-픽셀`) or renumber; record whether the motivation-pipe `D` was dropped or folded. Adopt an `HH:MM KST` (or sprint-counter) tag on same-day blocks so intra-day order is auditable.
- **RD-5 — Rewrite the legacy design docs (follow-up to SF-6/H2).** Beyond the banner, reframe `design-context.md` / `design-system.html` so deep-space / 별자리 / M3 is the 정본 and cosmic-pixel is labeled the rollback; mark `/core-brain`·`/trinity`·`/graph` nav rows legacy-only.
- **RD-6 — Patch the `simon-handoff` skill (root cause of H1).** In `SimonK-stack` `skills-src/simon-handoff/SKILL.md` Step 2, strip the previous top block's `## Latest —` prefix when prepending the new one, so the marker never accumulates. This is the durable fix; without it the count regrows ~1/session even after this cleanup.

---

*Prepared as the handoff-docs review artifact. Line numbers reference `docs/HANDOFF.md` at `30ac671` (pre-fix); after SF-1/SF-3/SF-4 the recent-section line numbers shift by a few.*

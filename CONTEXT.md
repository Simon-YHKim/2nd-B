# CONTEXT.md — 2nd-Brain domain glossary

> Ubiquitous language for the project (worldview v-final). Pure vocabulary — no
> implementation details, no specs. Source of truth for the *concepts*; code
> lives in `src/`, the canon in `docs/VISION.md`, visuals in `DESIGN.md`.
> Separate layer from `instincts/` (Claude mistakes) and `CLAUDE.md` (agent rules).

## The 5-tier model

| Term | Meaning |
|---|---|
| **Soul Core** | "나의 중심" — the user's center, formed by the 5 Pattern Cores. Mascot: **SecondB**. Internal key `core`. |
| **Pattern Core** | A 2nd-layer pattern hub ("Pattern Tesseract"). There are exactly five (below). |
| **Pattern Data** | 3rd-layer category built out of Logs (domain-tag classification). |
| **Log** | 4th-layer — a user record itself (work / relationship / knowledge / hobby …). Stored in `sources` / `records`. |
| **Pattern Link** | The Graph Network signal channel = a graph edge joining any layers. Closer ⇒ thicker + brighter. |

## The 5 Pattern Cores

| Pattern Core | Meaning (KO) | Mascot (was) | Internal key |
|---|---|---|---|
| **Bond Core** | 관계와 사랑 | **Relia** (Gadi) | `relation` |
| **Wisdom Core** | 배움과 지식 | **Lumen** (Lulu) | `knowledge` |
| **Narrative Core** | 기록 보관소 | **Foreman Momo** (Momo) + crew | `records` |
| **Muse Core** | 취향과 영감 | **Lumina** (Lumi) | `taste` |
| **Growth Core** | 일과 성장 | **Archon** (Archi) | `work` |

> Internal route / slug / DB keys are unchanged; only the display names + concepts moved.

## Mascots

| Name | Role (lexicon-safe concept) |
|---|---|
| **SecondB** | Soul Core navigator — central AI that reads patterns (Analytic) and opens alternate angles (Divergent). |
| **Archon** | Growth Core career consultant — growth directions tailored to the user's situation. |
| **Relia** | Bond Core warm guide — personality / relationships / inner world, so the user feels calmer and more settled (never clinical). |
| **Lumen** | Wisdom Core sage (Socratic / Confucius) — the *patterns of knowledge applied to life*, not raw facts. |
| **Foreman Momo** | Narrative Core crew foreman — sorts inputs into categories and finds "what happened" (organizer / search, not advice). |
| **Lumina** | Muse Core trainer + curator — enjoy hobbies more, suggest new ones, healthy life balance. |

> **Vela** (the old Imagination mascot) is retired — 공상 is now a SecondB mode, not a place.

## SecondB conversation modes

| Mode | Meaning |
|---|---|
| **Analytic** | Data-grounded analysis + practical advice (default). |
| **Divergent** | Data-grounded but explores radically different angles / assumptions / "what-ifs" (the former 공상 작업실, now a mode). Surfaces a "새로운 관점 / 가정" label. |

Both modes run the same safety + audit path (classify → audit log → single LLM wrapper). 공상 is never a safety bypass.

## Safety vocabulary

This is **not** a clinical product. The forbidden clinical lexicon (CI-enforced) is enumerated in `src/lib/safety/lexicon.ts` — never introduce those terms in any surface. Use instead: 자기 이해 / 성장 / 마음이 편안 / 정서적 안정 / self-understanding / growth / reflection.

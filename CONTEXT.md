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

## The brain model (0th / 1st / 2nd / 3rd)

> Canon sentence: **2nd-Brain is the bridge that builds your 2nd brain (the organic web of your data) and wires your 3rd brain (the AI navigator) so your 1st brain (the physical brain) advances toward the north star of your 0th brain (your philosophy).** The app is never a "brain" - it is the bridge / scaffold.

| Layer | Name | What it is | Owner / binding |
|---|---|---|---|
| **0th brain** | Philosophy, the north star | The values and roles the user steers by. Rendered as the Soul Core (북극성). | User-owned. Always full brightness (aspiration, not a data node). |
| **1st brain** | Physical brain | The user themselves - the neural net everything serves. | The user. |
| **2nd brain** | Data web | The LLM Wiki: records, sources, personas, wiki_pages - the organic web of the user's data. | The app builds it (Axis-1). |
| **3rd brain** | AI navigator | SecondB over the single LLM wrapper, answering on top of the 2nd brain (RAG). | The app wires it (Axis-2/3). |

## The value ladder L1 to L5 (= brightness = data quality = trust)

> One ordinal scale replaces five drifting scales (DIKW, Bloom, brightness, data-quality, trust). A node's level is at once its node/star brightness, its data quality, its source trust, and its drill stop level. The AI **proposes** a level rise; the user **ratifies** it (the propose to ratify loop).

| Level | Name | Brightness | DIKW / Bloom | Rises when |
|---|---|---|---|---|
| **L1** | Raw / 날것 | 20% | Data / Remember | a single Log is captured, unprocessed |
| **L2** | Tagged / 태깅됨 | 40% | Information / Understand | classified + a framework or domain tag is added (clipper kind, BFI/SDT id) |
| **L3** | Connected / 연결됨 | 60% | Knowledge / Apply, Analyze | a Pattern Link joins it to two or more nodes |
| **L4** | Cross-checked / 교차검증 | 80% | Evaluate (cross-source agreement) | two or more independent paths agree (e.g. BFI + audit + peer converge) |
| **L5** | Actionable / 실행가능 | 100% | Wisdom / Create | a user-ratified self-model change, or an accepted suggestion, runs |

> L4 is always labelled **교차검증 (cross-source agreement)**, never any clinical wording. The north star (Soul Core) is exempt from the ladder: it stays at full brightness because it is aspiration, not a data node.

## Terminology map (intent ↔ canon ↔ shipped key)

> Display labels and concepts only. Internal route / slug / DB keys stay frozen (core / work / relation / knowledge / records / taste). Topology per the synthesis memo (2026-06-17): one north star, seven self-understanding lenses, one role goal-tree.

| Intent term | Canon concept | Shipped name (key frozen) |
|---|---|---|
| **북극성 (north star)** | The 0th-brain philosophy as the hero node, always full brightness | **Soul Core** (key `core`, mascot SecondB) |
| **페르소나 (persona)** | The role / domain lenses that feed star brightness | the **5 Pattern Cores** (별자리: Growth / Bond / Wisdom / Narrative / Muse) |
| **별 (star)** | A self-understanding **dimension** (lens), an evidence axis, not a core | **별1 to 별7** (the seven lenses below) |
| **밝기 (brightness)** | The quality signal | the **L1 to L5** value ladder level |

### The 7 self-understanding stars (lenses, not cores)

Each star estimates one latent construct, has its own elicitation path and scorer, and emits a brightness (L-level). Their aggregate is the Soul Core readout (the 북극성 brightness). Stars are evidence axes; the 5 Pattern Cores are domain lenses.

| Star | Name | Construct | Engine |
|---|---|---|---|
| **별1** | 지금의 나 (trait state) | Big Five | `persona/bfi.ts` |
| **별2** | 회상 (narrative origins) | McAdams narrative identity | `interview/probe.ts` |
| **별3** | 보여지는 나 (other-view) | other-rated Big Five + reputation; doubles as a validity layer | 360 peer (postponed / adult-only) |
| **별4** | 리듬 / 순간의 나 (momentary state) | within-person variability | `esm.tsx` |
| **별5** | 관계의 나 (relational self) | attachment (anxiety / avoidance) | `persona/attachment.ts` (ECR-S) |
| **별6** | 될 수 있는 나 (possible self) | Possible Selves (Markus & Nurius 1986) | new |
| **별7** | 가치의 나 (values & strivings) | SDT + VIA strengths + personal strivings | audit `sdt:*` / `via:*` tags |

> **Roles / Action / Knowledge are NOT stars.** They are branches of the north-star goal-tree (who/why/what to Roles to Projects to Tasks), the structure the navigator steers toward, never a measurement axis. "지금의 나" is **별1 (a tool)**; the Soul Core / persona card is the **aggregate** of all seven stars, not a star.

# IDEN-SPEC.md - Identity Export Format & Viewer

> Status: **draft** (design locked, schema in review) · Owner: Simon · Last updated: 2026-06-16
> Axis (VISION 3축): **(2) 개인 비서 기반** - IDEN is the portable substrate the assistant (and any external AI) reads to know *who you are*.

`IDEN` is **the user's identity as one portable file**. It is two things at once:

1. **A data file** the user owns and carries (`*.iden`) - small, text, **read by any AI**.
2. **A document** a human reads like a one-page résumé - rendered by the **IDEN Viewer**.

The data is the source of truth. Graphics are **rendered from the data**, never stored as binary. Same model as JSON Resume: one data file → a printable, viewable sheet.

---

## 1. Locked design direction

- **Layout**: two-column CV (mock `E`). Left rail = identity at a glance (mark, name, signals, drivers, traits radar, cores). Right column = Summary, Traits, Profile, Contents.
- **Language**: **English is canonical output** (global common). KO is a localized render of the same data (see §7, ties to C7).
- **Print**: **A4 portrait, print-first.** `@page { size: A4 }`; `Ctrl/Cmd+P` produces a clean one-pager (no shadow, no screen chrome).
- **Aesthetic**: white paper, **single accent color**, thin 1px rules, aligned label/value rows, tabular numerals. The cosmic Soul Core appears **only as a ~40px monoline mark** - our iconic element is a small portion, per Simon's rule (this file is used everywhere).
- **Charts carry meaning** (Simon's HTML rule: "visual-first; if explanation is long, the graphic failed"). Inline SVG only: radar, donut, bars, node-graph. No glow, no gradients, no glassmorphism, no pill chips, no em dashes (DESIGN.md + anti-AI-slop).

### Color (from `src/lib/theme/tokens.ts`)
The viewer does **not** introduce hex literals beyond this table; it darkens one cosmic token for white-bg contrast.

| Role | Token | Value | Use in IDEN |
|---|---|---|---|
| Accent (single) | `soulViolet` darkened | `#6D51D6` | mark, bar/radar fill, donut primary. (`#A78BFA` is too light on white.) |
| Ink / body / muted / faint | `moonWhite`→inverted scale | `#1A1726` / `#2C2940` / `#7B7890` / `#A9A6BA` | text hierarchy on paper |
| Core: Growth | `signalBlue` | `#4CC9F0` | core dot/node (desaturated for print) |
| Core: Wisdom | `signalMint` | `#72F2C7` | core dot/node |
| Core: Bond | `pixelLamp` | `#FFD166` | core dot/node |
| Core: Muse | `dreamPink` | `#FF9FD6` | core dot/node |
| Core: Record | `mistGray` | `#8D98B8` | core dot/node |
| Soul Core | `soulViolet` | accent | center node + mark |

Core hues appear **only** as 8px dots / small nodes (meaningful color), never as fills or backgrounds. Everything else is monochrome + accent (≤3 visual colors per surface, DESIGN.md).

Font: **Pretendard** (renders Latin well; no Inter).

---

## 2. The `.iden` file (data, AI-readable)

Plain text. A **machine block** (YAML frontmatter) the AI parses instantly, then an optional human prose body, then the live request appended last.

```yaml
---
iden: 0.1                       # format version
name: Simon
generated: 2026-06-16
provenance_summary: { measured: 4, collecting: 1 }
identity:
  one_liner: "INFP, mediator. Driven by autonomy."
  fields:                       # ← schema-driven; viewer renders by `viz`
    - { key: traits, label: "Traits", viz: radar, source: { kind: measured, instrument: BFI-44 },
        data: { Openness: .82, Conscientiousness: .68, Extraversion: .35, Agreeableness: .74, Sensitivity: .41 } }
    - { key: patterns, label: "Patterns", viz: tags, source: { kind: measured, instrument: BFI-44 },
        data: [Inquisitive, Diligent, Warm] }
    - { key: type, label: "Type", viz: badge, source: { kind: assessment }, data: INFP }
    - { key: attachment, label: "Attachment", viz: badge, source: { kind: instrument, instrument: ECR-S }, data: Secure }
    - { key: drivers, label: "Drivers", viz: list, source: { kind: self_report }, data: [Autonomy, Growth, Authenticity] }
    - { key: cores, label: "Cores", viz: node-graph, source: { kind: derived },
        data: { center: Soul, nodes: [Growth, Wisdom, Bond, Muse, Record] } }
    - { key: contents, label: "Contents", viz: donut, source: { kind: count },
        data: { Sources: 48, Records: 30, Concepts: 12 }, topics: [habits, psychology, writing] }
summary:                        # AI narrative, clearly separated from measured data
  text: "A consistent self-documenter, open to new ideas and reflective by habit..."
  source: { kind: ai_summary }  # rendered under an "AI-generated interpretation" label
rules:                          # instructions to any AI reading this file
  - Answer grounded in this file. Do not invent facts not present here.
  - Treat the person as a thinking partner, not an evaluation subject.
  - The live request, if any, is at the very bottom.
---
# Simon - IDEN (human-readable body, optional)
...prose...

⟦REQUEST⟧
<the actual task the user is handing to the AI>
```

**Schema-driven (decided):** the viewer renders **whatever `fields` exist**, in order, each by its `viz` hint. Adding/removing a field never breaks the layout. The viewer must degrade gracefully on unknown `viz` (fall back to `list`/`badge`).

### Images / avatar
No embedded binary (keeps the file small + AI-friendly). Avatar = the **generated Soul Core mark** (deterministic from name/id). A real photo, if ever wanted, is a **URL reference** only.

---

## 3. `viz` mapping (renderer dispatch)

| `viz` | Input shape | Render | Rail or Main |
|---|---|---|---|
| `radar` | 3–8 named 0–1 scores | thin-stroke radar + accent polygon (rail) **and** numeric table (main) | both |
| `bar` | named 0–1 (or 0–100) | aligned horizontal bars, accent fill, tabular numerals | main |
| `donut` | named counts | monochrome+accent donut, center = total, legend with counts | main |
| `node-graph` | center + nodes | monoline links + small hued core nodes | rail |
| `badge` | single string | quiet inline value + source tag | main/rail |
| `tags` | string[] | middot-separated inline list (no pill chips) | main |
| `list` | string[] | stacked or middot list | rail/main |
| `stat` | number (+unit) | large tabular number + label | main |

Unknown `viz` → `tags`/`badge` fallback. A field may request `rail` or `main` placement; default by table above.

---

## 4. Provenance (the trust layer - visualized)

Every field carries `source.kind`. This is IDEN's signature: a résumé where **every line shows its evidence**. Renders as a **quiet uppercase gray tag**, never a loud chip.

| `kind` | Tag shown | Meaning |
|---|---|---|
| `measured` | `measured` (+ instrument, e.g. `BFI-44`) | psychometric/behavioral measurement |
| `instrument` | the instrument code (`ECR-S`) | named validated instrument |
| `assessment` | `assessment` | structured self/AI assessment |
| `self_report` | `self-report` | user stated it |
| `count` / `derived` | (no tag, or `derived`) | computed from the vault |
| `ai_summary` | `AI-generated interpretation` | **must be visually separated** from measured data |
| *(missing data)* | `collecting` (dimmed) | not yet known - shown faint, never faked |

Rule: **never render a value without an honest source.** Missing → `collecting` (dimmed), not invented. (Mirrors C8 source-verification ethos and the project "no fabrication" stance.)

---

## 5. AI summary path (constraint hooks)

The `summary.text` is generated, so it goes through the standard guarded pipeline - it is **not** exempt:

- **C1** - generated only via `src/lib/llm/gemini.ts` (no other SDK).
- **C9** - `classifyInput()` runs before the call; red zone short-circuits.
- **C3** - `ai_audit_log` INSERT on the call (including mock).
- **Lexicon** - output passes `src/lib/safety/lexicon.ts` post-filter. No clinical terms. (This is why Big Five's *Neuroticism* axis is surfaced as **"Sensitivity"** in IDEN - brand-safe, non-clinical, while the raw key stays standard internally.)

---

## 6. Renderer architecture

```
.iden (data, source of truth)
   │  parse machine block
   ▼
IDEN Viewer  ──renders──►  two-column A4 sheet (HTML, this spec's mock E)
   │
   ├─ export: print → PDF (A4, the shareable résumé artifact)
   └─ export: standalone HTML (self-contained, inline SVG, no build)
```

- One data file, two readers: **human** (rendered sheet) + **AI** (machine block). The sheet includes a "view source `.iden`" affordance.
- Viewer is **pure render** (no app state). Given the same `.iden`, output is deterministic - printable, diffable, shareable.

---

## 7. i18n (ties to C7)

- **English is canonical** for IDEN output (global). 
- KO render uses the same `fields` data with localized `label`s; **EN↔KO key parity** is preserved per C7 (EN canonical). Field `key`s are language-neutral; only `label` localizes.

---

## 8. Open questions (flag before build - content may change)

Resolved for v0.1 (2026-06-16). Per Simon's standing note ("if what the system represents changes, ask"), the two marked *may change* are not load-bearing; the schema-driven renderer absorbs either way.

- [x] `fields` set (traits, patterns, type, attachment, drivers, cores, contents) is the v0.1 set. **May change** - render stays schema-driven.
- [x] Big Five shows **all 5 axes** incl. *Sensitivity*.
- [x] Cores fixed at **5** for v0.1. **May change** - renderer already handles N nodes.
- [x] `summary` (AI narrative) **ships in v0.1**, under the "AI-generated interpretation" label, via the guarded path (§5).

---

## 9. Implementation status

`src/lib/iden/` implements the renderer (pure, tested):

- `types.ts` - `IdenDoc` / `IdenField` / `IdenSource` / `Viz`.
- `render-html.ts` - `renderIdenHtml(doc, { locale })` produces the self-contained A4 two-column sheet. Colors sourced only from `theme/tokens` (`lightCosmic` paper/ink + `cosmic` accent/core hues); translucency via SVG `fill-opacity`; zero new hex literals.
- `serialize.ts` - `serializeIden(doc, { request, body })` produces the `.iden` text (the AI-readable half): the YAML machine block (§2), an optional prose body, and the live `⟦REQUEST⟧` appended last (query-at-end). Hand-emitted compact flow YAML; strings are quoted only when a plain scalar would be unsafe or change type on parse, so the block round-trips. Pure, deterministic, no new dependency at runtime.
- `build-iden.ts` - `composeIdenDoc(persona, opts)` (pure) maps a `PersonaCard` + vault counts to an `IdenDoc`: BFI traits -> radar (neuroticism surfaced as non-clinical **Sensitivity**), top positive traits -> pattern tags, MBTI -> badge, ECR-S -> badge, value frameworks -> drivers, the fixed pattern cores -> node-graph, live counts -> contents donut. A field appears only with real evidence and an honest `source.kind` (missing -> absent, never faked). `buildIdenDoc(userId, opts)` is the thin fetcher (persona + counts); the AI summary is reused from the persona's already-guarded narrative, so this adds no new LLM call (C1/C9/C3 still hold via `buildPersona`). EN canonical; KO localizes labels/values while core node names stay English (renderer color map; C7).
- `iden-export.ts` - `buildIdenExport(doc, opts)` (pure) bundles the two shareable artifacts (`.iden` text + standalone A4 HTML) plus a download filename stem; `exportIden(userId, opts)` is the fetcher.
- `sample.ts` - `SAMPLE_IDEN`, the dummy doc mirrored from mock E.
- `__tests__/render-html.test.ts` - 11 contract tests (radar+bars, full-name radar accessibility, donut, node-graph, provenance, AI-summary separation, schema-driven drop, KO locale, HTML escaping, no em dash / no forbidden lexicon).
- `__tests__/serialize.test.ts` - 13 contract tests (block/body/request order, parser round-trip, string-typed version+date, provenance tally, summary+rules separation, query-at-end, placeholder, omitted summary/rules, stat+unit, escaping of unsafe scalars, determinism, lexicon-clean).
- `__tests__/build-iden.test.ts` - 11 contract tests for `composeIdenDoc` (trait radar + Sensitivity, pattern derivation, badges, drivers, cores+contents, summary gating, heuristic vs no-evidence, null-persona fallback, KO parity, both-consumer round-trip, lexicon-clean).
- `__tests__/iden-export.test.ts` - 5 contract tests (artifact bundle, filename stem, Hangul fallback, locale passthrough, sizes).

Not yet built (device-QA gate = Simon, per `ANDROID_QA_GUIDELINES.md`): the viewer UI wiring - an export action on `/wiki` or `/data` that calls `exportIden()`, a WebView preview of the rendered sheet, and native download / PDF share. `buildIdenExport` is the device-independent seam that step calls. PDF export = browser/WebView print of the rendered sheet.

---

## Appendix - reference mocks

Design exploration lives in `docs/iden-mocks/` (throwaway, dummy data):
`iden-E-twocol.html` (locked direction) · `iden-D-editorial.html` (single-column alt) · `iden-rendered.html` (actual `renderIdenHtml` output).

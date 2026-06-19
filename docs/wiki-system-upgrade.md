# Wiki system upgrade — graphify-informed, make-it-work plan

Status: planning + STEP 1 in progress. Owner: Simon. Axis: (1) 알아가기 + (2) 개인 비서 기반.

This doc turns a review of [safishamsi/graphify](https://github.com/safishamsi/graphify)
(69k★, YC S26 — a *developer* tool that turns code/docs/media into a queryable
knowledge graph) into a concrete plan to make **our personal-wiki knowledge graph
actually work** at $0/mo, solo, before the Aug deadline.

graphify and our `/wiki` share knowledge-graph DNA but serve different users:
graphify indexes a *codebase for developers*; our wiki indexes a *person's own
records for that person*. So we adopt **ideas**, never the package.

## Adopt (maps to our canon + screens)

1. **Edge type + confidence** on `wiki_links` (graphify's `EXTRACTED / INFERRED /
   AMBIGUOUS`). Fits our **propose→ratify** canon exactly: AI emits `inferred`
   links, the user ratifies → `ratified`. Today `wiki_links` has no type.
2. **Lightweight clustering + god-nodes + surprise** to power `/research`
   (창작 군집 / "흩어진 기록이 이렇게 이어져요") and `/wiki` ("살아있는 두뇌
   N페이지·M연결"), which are **currently dummy**. `graph-stats.ts` already
   computes `topHubs` (god-nodes), counts, tags, orphans — it just needs wiring.
3. **Semantic search via embeddings** (graphify uses embeddings; we use
   keyword/regex only). pgvector + Gemini free `text-embedding-004`. **Deferred to
   STEP 4** (cost/complexity; STEPs 1-3 deliver real data without it).
4. **Incremental extraction on change** (graphify's git-hook re-extract) → our
   "capture a piece → Phase 1/2 runs". Partly wired already (see Current state).
5. **"What connects X to Y" (shortest-path)** over `wiki_links` for SecondB
   evidence. After STEP 1 makes the graph real.

## Drop (do NOT bring over)

- tree-sitter / 36 code grammars (we index thoughts, not code).
- faster-whisper, Neo4j/FalkorDB/GraphML/Gephi, Docker, IDE MCP server,
  graph.json 512MB, cross-project registry, PR triage — all dev-tool infra. Our
  Postgres (`wiki_links`) + optional pgvector is enough.
- Leiden-in-Python clustering (heavy for an Edge Function) → reimplement a light
  version (tag co-occurrence / connected-components / pgvector kNN).
- graphify as a dependency (Python CLI, not embeddable in RN).

> graphify is already installed in SimonK-stack as a **dev** tool (`graphify-out/`,
> for navigating *our codebase*). Keep that; it is separate from the product wiki.

## Current state (verified 2026-06-19)

Schema (`db/migrations/0022_wiki_rag.sql`): `sources` → `wiki_pages`
(`source|entity|concept`) → `wiki_links` (directed `[[wikilink]]` edges,
user-scoped, RLS). No `relation_type`/`confidence` on edges; no pgvector.

Pipeline:
- `phase1.ts` `runPhase1()` — Gemini summarize + extract `entities[]` +
  `concepts[]` + 4 questions + category + tags + relevance + keep. Has a mock
  mode (offline-testable). Output stored on `sources.frontmatter.__phase1__`.
- `phase2.ts` `generateSourcePage()` — promotes a source to a `kind='source'`
  page, merges `concepts → tags`, runs `syncWikiLinks` for `[[wikilinks]]`.
  **Gap: it never creates `entity`/`concept` pages from Phase 1 output, and
  never links the source to them.** So the graph is source-pages only.
- `graph-stats.ts` `computeGraphStats()` — already returns `pageCount`,
  `edgeCount`, `countByKind`, `topHubs` (god-nodes), `topTags`, `orphans`.
- Both phases are wired into the **legacy** `/wiki` + `/inbox` ("Generate page").
  The new **deep-space** `/wiki` + `/research` screens are dummy (data-wiring).

## Plan

### STEP 1 — make the graph real + wire it (current)

1a. **Entity/concept materialization** (`src/lib/wiki/`, the core gap):
   after `generateSourcePage` (or as a Phase 1.5), for each `Phase1.entities`
   and `Phase1.concepts`, `upsertWikiPage({ kind:'entity'|'concept', ... })`
   (idempotent on `(user_id, slug)`) and create `wiki_links` from the source
   page → each entity/concept page. Dedupe by slug; skip empties. Unit-tested
   with the Phase 1 mock (no Gemini needed).
1b. **Wire deep-space UI to real data**: `/wiki` renders `listWikiPages` +
   `computeGraphStats` (stats + tag chips + page rows + backlinks via
   `getBacklinks`); `/research` renders clusters/hubs from the same stats;
   `/inbox` triggers `runPhase1` + `generateSourcePage`. Replaces the dummy
   `DeepSpaceWikiScreen` / `DeepSpaceResearchScreen` content.

### STEP 2 — edge type + confidence (propose→ratify)
Add `relation_type` (`wikilink|inferred|ratified`) + `confidence` to
`wiki_links`; AI-inferred links land as `inferred`, surfaced for the user to
ratify. Migration + queries + UI affordance.

### STEP 3 — lightweight clustering + stats polish
Cluster via tag co-occurrence / connected-components in SQL or a pure helper;
name clusters; surface god-node + a "surprise" (unexpected cross-cluster link).
Feeds `/research` + `/wiki` + SecondB.

### STEP 4 — embeddings (deferred)
pgvector + Gemini free `text-embedding-004` (batched, $0). Semantic "related
records", surprise ranking, "what connects X to Y" kNN. Biggest lift; last.

## Constraints honored throughout
$0/mo (free tiers only), C1/C3/C9 (all LLM via `gemini.ts`, audit + classifier),
C7 (i18n parity), RLS per-user graph isolation, `npm run verify` green.

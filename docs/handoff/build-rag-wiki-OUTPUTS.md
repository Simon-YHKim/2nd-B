# build-rag-wiki — OUTPUTS

> Operator guide for the knowledge base + safety + advisor that the
> `build-rag-wiki.md` handoff defines. Matches `docs/handoff/build-rag-wiki.md §6.8`
> ("README documentation") acceptance criterion.

---

## How to ingest the knowledge base (one command)

After cloning the repo + applying migrations to a Supabase project:

```bash
# 1. Apply migrations (db/migrations/0001 → 0015) — handled by Supabase MCP
#    or `supabase db push` locally. The CI job `sql` validates on every PR.

# 2. Seed the 21 curated batches via the Edge Function:
curl -sS https://<your-project-ref>.supabase.co/functions/v1/seed-knowledge-base
```

The Edge Function (`supabase/functions/seed-knowledge-base/index.ts` in spirit;
deployed via supabase MCP) fetches each `supabase/seed/*.sql` from this repo's
raw GitHub URL and runs it through the SECURITY DEFINER `admin_exec_sql` RPC
(migration 0015). TRUNCATE first so the operation is idempotent.

Expected result: **94 rows across 30 frameworks** in `knowledge_sources`.

Verify with:

```sql
SELECT count(*) FROM public.knowledge_sources;        -- → 94
SELECT framework, count(*) FROM public.knowledge_sources
GROUP BY framework ORDER BY framework;
```

---

## How to call `retrieveEvidence` from app code

```typescript
import { callAdvisor } from "@/lib/llm/gemini";

const res = await callAdvisor({
  userId: currentUserId,
  userMessage: "오늘 회사에서 번아웃이 와요",
  locale: "ko",
  userAgeRange: "young_adult",   // optional
  conversationContext: "최근 entries: career stress, sleep",  // optional
});

// res.zone:           "green" | "yellow" | "red"
// res.text:           the advisor reply OR the fixed crisis template
// res.fixedTemplate:  true when text came from fixedCrisisResponse (RED)
// res.matchedBatches: e.g. ["crisis-detection", "cbt-rebt", "self-compassion"]
// res.evidence:       [{ title, doi, summary }, ...] (cited rows)
// res.cssrsLevel:     1..6 | null (Columbia score when inferable)
// res.triggers:       categorical only, never raw user text
```

The wrapper guarantees:
- **C9** Layered safety classifier runs FIRST. RED short-circuits before any LLM call.
- **C3** Every advisor call writes an `ai_audit_log` row (zone, model, latency, hashes).
- **C3-adjacent** RED also writes a categorical `crisis_events` row.
- **C1** `@google/genai` is imported only from `src/lib/llm/{gemini,safety}.ts`.

To call without the advisor wrapper (e.g., the audit interview):

```typescript
import { callGemini } from "@/lib/llm/gemini";

const res = await callGemini({
  userId, locale: "ko",
  purpose: "audit_qa",        // 'journal_reflect' | 'audit_qa' | 'knowledge_lookup' | 'persona_chat'
  user: answerText,
});
```

`callGemini` runs lexicon safety only (no Path A retrieve). Cheaper, still C3/C9 compliant.

---

## Test results (acceptance per handoff §10)

`npm run verify` runs the full gauntlet. Current numbers on commit `f8c9f07`:

| Probe | Result | Detail |
|---|---|---|
| `npm run lint` | ✓ | 0 errors, 0 warnings |
| `npm run type-check` | ✓ | tsc --noEmit strict |
| `npm run check:i18n` | ✓ | EN/KO key parity (46 keys, 4 namespaces) |
| `npm run check:lexicon` | ✓ | 60 files scanned, 0 violations |
| `npm run check:llm-boundary` | ✓ | `@google/genai` restricted to gemini.ts + safety.ts |
| `npm run check:constraints` | ✓ | C1~C12 PASS (C11 PARTIAL by design — auto-responder = Sprint 1) |
| `npm test -- --ci` | ✓ | **97 / 97** across 8 suites |

Safety-corpus detail (`src/lib/safety/__tests__/korean-corpus.test.ts`):

| Zone | Cases | Result |
|---|---|---|
| Korean RED | 13 | 0 false negatives (lexicon layer) |
| English RED | 7 | 0 false negatives |
| Korean YELLOW | 5 | 0 promoted-to-red errors |
| English YELLOW | 3 | 0 promoted-to-red errors |
| Korean GREEN | 6 | 0 promoted-to-red errors |
| English GREEN | 3 | 0 promoted-to-red errors |

Layered safety classifier unit tests (`src/lib/llm/__tests__/safety.test.ts`):

- ✓ mock mode skips the Gemini Flash call entirely
- ✓ live mode + LLM RED on green-text input → union promotes to RED
- ✓ live mode + LLM GREEN on lexicon-RED input → lexicon wins (false-negative defense)
- ✓ live mode + LLM throws → silent fallback to lexicon
- ✓ live mode + LLM returns malformed JSON → silent fallback
- ✓ fixed templates contain mandatory hotline strings (1393/1577-0199/988/findahelpline)
- ✓ fixed templates do not contain AI-improvised crisis language ("have you tried", "you should")

Retrieval routing tests (`src/lib/knowledge/__tests__/retrieve.test.ts`):

- ✓ 10 keyword-routing cases (KO family fight → attachment+interpersonal; EN career → sdt+big-five; etc.)
- ✓ Always loads `crisis-detection` as the safety rubric
- ✓ Falls back to `[self-knowledge, sdt, big-five]` when no keywords match
- ✓ Caps matched batches at 4 per call

---

## Known limitations

1. **Path A only (Karpathy Wiki) — no embeddings yet.** Keyword routing serves
   95-row scale comfortably; pgvector RAG (Path B from handoff §5) is deferred
   to v2 after 1k+ rows or paraphrased queries become a measurable problem.

2. **LLM-Flash classifier (Layer 2) needs a live benchmark.** Unit tests cover
   the merge logic with mocked Gemini responses, but no benchmark exists for the
   actual Korean RED false-negative rate on novel phrasings. When `GOOGLE_API_KEY`
   is configured and `EXPO_PUBLIC_LLM_MODE=live`, the next sprint should run the
   Korean corpus against live Gemini Flash and record FN rate to
   `~/.gstack/projects/2nd-b/health-history.jsonl`.

3. **Batch markdown is filesystem-only.** `loader.ts::loadBatch` reads from disk
   in dev/node. The mobile/web bundle currently returns `""` for batch
   excerpts. Two paths for v2: (a) bundle as Expo assets, (b) upload to Supabase
   Storage and fetch at runtime. The Advisor still works without batch
   excerpts; the `assembledPrompt` just becomes thinner.

4. **`types.gen.ts` generated but not wired.** `createClient<Database>()` is
   commented out because the Insert/Update shapes need a follow-up alignment
   pass against supabase-js v2's typed builder. Runtime unaffected;
   compile-time table typing deferred.

5. **`admin_exec_sql` is a small SECURITY DEFINER attack surface.** REVOKE from
   anon/authenticated and GRANT to service_role only. The Edge Function is the
   only caller. After seeding completes, consider deleting both the function
   and the Edge Function entirely (one-time use). Not done yet.

6. **Crisis-event log uses non-cryptographic `djb2` for `user_id_hash`.**
   Acceptable for present scale (forensics tolerates collisions; reverse
   lookup requires the original UUID), but SHA-256 via `expo-crypto` is
   the upgrade path for v1.5.

---

## Where to extend

### Add a new research batch

1. Run the master research prompt in `docs/handoff/psychology-handoff.md` for
   ONE framework. Get the academic sources, DOIs, application notes.
2. Save the batch markdown as `docs/research/batches/<slug>.md` (use
   `_template.md` as the skeleton).
3. Save the verified rows as `supabase/seed/<slug>.sql`.
4. Add `<slug>` to:
   - `docs/research/batches/INDEX.md`
   - `docs/research/CLAUDE.md §2` routing table (with the keyword patterns
     that should route to it)
   - `src/lib/knowledge/retrieve.ts::ROUTING` (regex + slug list)
   - `src/lib/knowledge/retrieve.ts::SLUG_TO_FRAMEWORK` (slug → framework
     string(s) in knowledge_sources)
   - `supabase/seed/INDEX` if such a file exists (currently implicit by
     filename alone)
5. Re-invoke the Edge Function so new rows are applied:
   `curl -sS https://<project>.supabase.co/functions/v1/seed-knowledge-base`
6. Verify `SELECT count(*) FROM knowledge_sources WHERE framework = '<...>'`.

### Switch from mock LLM to live Gemini

1. Get a `GOOGLE_API_KEY` from https://aistudio.google.com/apikey (free quota).
2. Set in `.env` and any deploy environment (Vercel project Variables,
   GitHub repo Variables for the Pages build):
   ```
   GOOGLE_API_KEY=...
   EXPO_PUBLIC_LLM_MODE=live
   ```
3. (Optional, for Vertex AI / production scale) Set:
   ```
   EXPO_PUBLIC_USE_VERTEX=true
   GOOGLE_CLOUD_PROJECT=<your-gcp-project>
   GOOGLE_CLOUD_LOCATION=us-central1
   ```
4. Restart the app. `callAdvisor` and `classifySafety` now hit the real Gemini
   API. mock-mode tests still pass because they explicitly override env.

### Tighten the LLM-Flash classifier prompt

Edit `src/lib/llm/safety.ts::SYSTEM_PROMPT`. Then run:

```bash
npm test -- --ci src/lib/safety/__tests__/korean-corpus.test.ts
npm test -- --ci src/lib/llm/__tests__/safety.test.ts
```

Both must stay green (0 RED false negatives, all 8 layered tests).

### Add a new screen that consumes the Advisor

Import `callAdvisor` and render the `FollowupCard` component pattern from
`src/app/journal.tsx`. The card handles:
- Zone-aware color (green = brand, yellow = warning, red = danger)
- Matched batches as chips
- Cited evidence (title + DOI)
- Crisis modal auto-open on RED

If you need a domain-specific advisor flow (e.g., career-only), pass a
narrower `conversationContext` or extend `retrieve.ts::ROUTING` with a
domain-specific pattern.

### Update the safety lexicon

Edit `src/lib/safety/lexicon.ts`. The same lists drive both:
- runtime `classifyInput` (Layer 1 backstop)
- the LLM-Flash classifier prompt seeds (Layer 2)
- the CI scanner that blocks forbidden vocabulary in user-facing copy

After any change run `npm run verify` to confirm `korean-corpus.test.ts` still
passes and `check:lexicon` finds no new violations in user-facing code.

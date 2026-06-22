# Claude reasoning seam — owner setup

Status: **wired (Option A implemented)**. The reasoning path in
`src/lib/llm/gemini.ts` routes the pro-tier call to the `claude-proxy` Supabase
edge function whenever `EXPO_PUBLIC_REASONING_PROVIDER=claude`. The client stays
SDK-free (C1); the Anthropic key lives only in the function's secrets. What
remains for the owner: deploy the function, set its `ANTHROPIC_API_KEY` secret,
and run the live smoke test (deferred until the Anthropic account has credit —
until then a live call returns `insufficient credits`).

## Why a seam (and why C1 is not violated)

C1 (hard constraint) says: **all LLM calls route through
`src/lib/llm/gemini.ts`, and that file is the only place allowed to import
`@google/genai`. No other LLM SDK may be imported anywhere** (ESLint +
`scripts/check-llm-import-boundary.ts` block OpenAI/Anthropic/Cohere/etc.).

The seam respects this by **never importing an Anthropic SDK in the client**:

- `EXPO_PUBLIC_REASONING_PROVIDER` selects the reasoning backend
  (`gemini` default, `claude` reserved).
- `resolveReasoningProvider()` in `gemini.ts` reads the flag and returns
  `claude` or `gemini`. On `claude`, the pro-tier call is routed to the
  `claude-proxy` edge function (`reasoningProxyFn()`); the Anthropic call happens
  server-side, so no SDK is imported in the client.
- The chosen provider is recorded in the audit row (`AuditMeta.reasoningProvider`)
  so the trail shows which backend produced a reasoning answer (C3 unaffected).

Both real options below keep the **client SDK-free for Claude**, so C1 still
holds when the owner wires them. The client never imports `@anthropic-ai/*`; the
Claude call happens server-side (edge function) or via the existing Vertex
backend, exactly the pattern already used for Gemini.

## Where the seam lives

- `src/lib/llm/types.ts`
  - `ReasoningEffort = "low" | "high" | "xhigh" | "max"`.
  - `AuditMeta.reasoningProvider?: "gemini" | "claude"`.
- `src/lib/llm/gemini.ts`
  - `resolveReasoningProvider()` — reads `EXPO_PUBLIC_REASONING_PROVIDER` and
    returns `gemini` or `claude`. `reasoningProxyFn()` maps that to the edge
    function name (`gemini-proxy` / `claude-proxy`).
  - `callAdvisor()` and the pro-tier `callGemini()` path call it, route to the
    matching proxy, and stamp the provider into the audit row.

## Option A (recommended, IMPLEMENTED) — `claude-proxy` Supabase edge function

`supabase/functions/claude-proxy/` mirrors `gemini-proxy` so the client stays
SDK-free and the key never reaches the device (C1-safe, parity with how the
public web bundle already reaches Gemini). It is committed; the owner deploys it.
The original build steps below are kept as the design record.

1. **Create the function** `supabase/functions/claude-proxy/` modeled on
   `gemini-proxy`:
   - Accept the same body shape (`system`, `user`, `model`, `purpose`,
     `effort`, optional `responseSchema`).
   - Run the **same server-side crisis gate** the gemini-proxy runs on the
     `user` channel (return a 422 `safety_red_zone` on a crisis hit, so the
     existing `inspectProxyCrisisRejection()` fallback in `gemini.ts` keeps
     working unchanged — C9).
   - Call the Anthropic Messages API from the **edge runtime only**
     (`ANTHROPIC_API_KEY` as a Supabase function secret — never an
     `EXPO_PUBLIC_*` var).
   - Map `effort` -> Claude extended-thinking budget (see `effortToConfig()` in
     `gemini.ts` for the proportional ladder to mirror).
   - Write the `ai_audit_log` row server-side (service_role) and return
     `audited: true` so the client skips the duplicate insert (parity with
     gemini-proxy / C3).

2. **Wire the client branch** in `gemini.ts`: in the reasoning path, when
   `resolveReasoningProvider()` returns `claude`, invoke `claude-proxy` instead
   of `gemini-proxy`. The function signature, body, and crisis-fallback handling
   are identical — only the function name changes. **No new import.**

3. **Enable**: set `EXPO_PUBLIC_REASONING_PROVIDER=claude` and deploy the
   function with its `ANTHROPIC_API_KEY` secret.

Cost note (blueprint §5, $0/mo): Claude is **not** free-tier. Gate it behind the
premium ("brain") entitlement exactly as `purpose:"advisor"` is gated in the
gemini-proxy today, and keep the per-user/day spend cap on the proxy side.

## Option B — Claude on Vertex (existing Vertex backend)

Anthropic models are available through **Vertex AI Model Garden**, which is the
C2 submission-evidence backend the app already constructs (`vertexai: true`).

1. Enable the Claude model in the GCP project's Vertex Model Garden and grant
   the service account access.
2. In the reasoning path, when the provider is `claude` **and**
   `EXPO_PUBLIC_USE_VERTEX=true`, call the Claude-on-Vertex endpoint. On native,
   this can reuse the existing Vertex credential path; on web, route through the
   edge function (Option A) so no key ships to the browser.
3. Map `effort` -> Claude thinking budget as in Option A.
4. C2 holds (Google Cloud product), C3 holds (audit row with
   `reasoningProvider: "claude"`, `vertexBackend: true`).

This avoids a second key/billing surface (everything stays on the GCP budget),
at the cost of Model-Garden availability/region constraints.

## Effort mapping reference

`effortToConfig(effort)` in `gemini.ts` is the canonical proportional ladder.
Whichever backend the owner wires, mirror these levels:

| effort  | intent                | Gemini thinkingBudget | output cap |
|---------|-----------------------|-----------------------|------------|
| `low`   | Free / quick replies  | 512                   | 1024       |
| `high`  | default               | 2048                  | 2048       |
| `xhigh` | deep reflection       | 8192                  | 4096       |
| `max`   | hardest problems      | -1 (dynamic)          | 8192       |

For Claude, translate `thinkingBudget` to the extended-thinking token budget and
keep `maxOutputTokens` as the matching cap.

## Checklist before flipping the flag

- [ ] `claude-proxy` deployed (Option A) **or** Claude-on-Vertex enabled (Option B).
- [ ] Server-side crisis gate present on the `user` channel (C9).
- [ ] Audit row written server-side with `reasoningProvider: "claude"` (C3).
- [ ] Premium entitlement gate + spend cap in place (blueprint §5 / $0-free-tier).
- [ ] No `@anthropic-ai/*` import in client code (C1 — verify
      `npm run check:constraints` / the LLM import-boundary scan stays green).
- [ ] Set `EXPO_PUBLIC_REASONING_PROVIDER=claude`.

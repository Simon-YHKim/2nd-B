# Kept exchange: identity and known RED preparation

This is a dormant T28 preparation function. It has no screen/controller consumer,
production singleton, storage call or model call. It does not fix the current
automatic AI readers and does not acknowledge a server hold. Base: main
`4fcb508da631f9ea81da32eca6609024442d3c2e` (started from `931314f8`, then
fast-forwarded after T38-B merged). T38-B leaves the registry/keep formatter
unchanged and adds the `safety` work kind; it is rejected as keep authority.

## Input and result

`prepareKeptExchange` reads `getSessionSnapshot(work)` from the actual T38 registry.
It accepts an already claimed `keep` work token whose key is the reply turn ID.
Capture the expected snapshot revision **after** claiming work, because claiming
work changes that revision. The five owner/session identity fields must match and
the exact work object must still be registered; equal-looking copied tokens fail.
The helper neither reacquires an account lease nor accepts a saved snapshot as
evidence of current ownership.

The actual `isKeepable` and `findPromptIndex` functions select the pair. Turn IDs,
exchange IDs and increasing sequences are checked. Missing/synthetic/empty replies
and a foreign paired exchange return a body-free failure. Normal unpaired replies
retain the existing `prompt:null` format. Duplicate or malformed identity cannot
fall back to the latest reply. The actual `exchangeTopic`, `composeExchangeBody`
and `exchangeMarkdown` functions preserve the current format and per-part limit.

Both full turns' `safetyZone` values are inspected before formatting/clipping.
Either RED produces `hold-required` with only `turn-zone-red` and the matching
turn IDs. Other or absent verdicts produce `unconfirmed`, never `allowed`, `safe`,
`ai_hold:false` or a durable receipt. Ordinary-looking saved text or a fixed
guidance reply cannot clear the paired input's known RED.

The frozen result binds owner/epoch/content/session, snapshot revision, operation,
exchange and turn IDs to a nested formatted payload and the hold requirement. It
is deliberately not a `CaptureInput`; a later writer must consume the requirement
with the payload rather than silently drop it. No original RED text, hotline-based
inference, global body hash or reason narrative is added to metadata/logs.

T38 permits replacing text while retaining a turn ID/sequence. Therefore the
snapshot revision is required: same ID does not prove the same body. Any revision
change, including an unrelated appended turn, conservatively requires fresh
preparation. The old immutable result remains unchanged. A later unknown plan
cannot authorize releasing an already persisted hold; the future server writer
must enforce monotonicity.

The result is a synchronous preparation, not a reusable ownership capability.
Consent and owner/content/work checks at every later asynchronous write boundary,
idempotency, exact-duplicate survivor hold ACK and durable version identity remain
the caller/server's responsibilities. A prepared result is never “saved”.

## What the current code still loses

At main `f3136a1524dd73be56051b591c6abbaaf7eb9c40`, existing offline probes executed
the actual functions with external I/O doubles:

- `embedAndStorePage`: a synthetic `ai_hold:true` page still made one embedding
  boundary call and one vector write.
- `exportUserWiki`: held page text/source titles and an unpromoted kept-source
  Storage body still entered the automatic snapshot.
- `retrieveChatContext`: a held page returned by the query double remained in RAG.
- Actual screen `keepExchange`: a RED in-memory pair with lexically GREEN saved
  text was passed to capture with only owner, signal, markdown, kind and tags.
  The known verdict and exact pair identity were absent.

These are unresolved integration failures, not passing safety regressions. Latest
main through `931314f8` changed citation read handling and early interview RED
delivery, not these paths. This helper does not change their runtime behavior.
Synthetic hold flags in query doubles do not prove production columns/authority.
Execution sources, hashes and JSON are in the T28 preparation handoff evidence.

## Subsequent connection gates

1. At the actual boundary branch, bind input/semantic/server-422/output RED to the
   exact request and input revision before audit waits. Existing final safety
   and hotline-only callbacks cannot recover that origin. `turn-zone-red` here
   honestly preserves only the fact currently available; status 422 or a hotline
   alone is not authenticated provenance.
2. Complete T38's real content/phase/consent and write-quarantine integration.
   No UI activation follows merely from importing this helper. Abort/timeout
   must not be interpreted as confirmed cancellation or rollback.
3. A server-owned source write must preserve the payload and known hold together,
   including exact duplicate survivor, near duplicate, Storage fallback and lost
   responses. Hold failure cannot become AI-safe success. A frontmatter boolean
   is not the durable contract, and there is no automatic hold release.
4. Give automatic AI context its own eligible reader. Do not use an optional
   `excludeHeld` flag or fall back to raw `exportUserWiki` on error. Verify source
   version and record/page/parent/derived provenance before body download,
   truncation, dispatch and result commit. RAG re-fetch, vectors, shared entity
   pages, imported profile claims, pending proposals and caches all remain work.
5. The person's explicit open/copy/export keeps its existing ownership rules and
   current behavior. Hold alone does not erase or hide their text. This commit
   leaves `exportUserWiki` byte-identical; it does not promise all server export
   endpoints include all held turns. The future AI reader is a separate surface,
   not a shared `purpose:"human"` bypass for automatic callers.
6. Preserve server-owned `interview_ai_hold`, 0225 late RED/40001 transaction retry
   without model retry, and explicit r0 versus T36 rule versioning. No transcript
   activation, Q13 expansion, original-text deletion, coverage rollback or model
   reclassification is authorized here. #2535 is unnumbered; standalone application immediately supplies D4's server half (held-record vector cleanup and AI-only views), with reader/writer wiring and UI in separate PRs;
   #2440 BLOCK3 and frozen/failed candidates remain closed.

Tests use the actual registry, account/content boundaries and formatters with
controlled external state. Targeted runs and scratch source mutations verify
identity, revision, pair selection, full-turn RED and immutability. They do not
prove durable server enforcement, device behavior or app completion. Independent
review, root full verification/CI and later server/app/device gates are separate.

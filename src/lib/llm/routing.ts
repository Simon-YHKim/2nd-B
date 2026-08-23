// D-26 Phase 2 — purpose-keyed VENDOR routing (client mirror).
//
// The client only picks WHICH edge proxy a call travels through; the proxy
// owns the actual model id server-side (a tampered client can never
// self-select an expensive model). C1 holds: no vendor SDK is ever imported
// here — "claude" / "openai" are Supabase Edge Function names.
//
// Activation: EXPO_PUBLIC_LLM_PHASE=2. Default (unset / "1") keeps the
// Phase 1 posture — 100% Gemini backbone, XPRIZE-safe, $0/mo — so shipping
// this file changes nothing until the operator flips the env.
//
// SAME-QUALITY invariant: seats key on purpose (situation), NEVER on the
// subscription tier. See docs/LLM-ROUTING.md.

import type { PromptPurpose, ReasoningEffort } from "./types";

// xai joined on 2026-08-21 (Simon: put Grok in). The coding session had
// recommended waiting until after the Gemini deadline; the override is
// answered by keeping the blast radius small rather than by argument. Nothing
// routes to xai by default - every switch below still defaults elsewhere, and
// xai-proxy seats only the reasoning purposes plus chat, so a switch pointed at
// it for anything else fails loudly instead of billing quietly.
export type LlmVendor = "gemini" | "claude" | "openai" | "xai";
export type LlmProxyFn = "gemini-proxy" | "claude-proxy" | "openai-proxy" | "xai-proxy";

/**
 * One place that turns an operator's typed value into a vendor, so the four
 * switches cannot disagree about what they accept.
 *
 * `grok` maps to `xai`. The product is called Grok; the API host, the secret
 * name and the audit ledger all say xai. An operator will type the name they
 * know, and refusing it would fall through to Gemini with no error anywhere -
 * exactly the silent no-op that EXPO_PUBLIC_REASONING_PROVIDER=openai used to
 * be, and that cost this project a wrong belief about which vendor was serving.
 */
export function normalizeVendor(raw: string): LlmVendor | null {
  const v = raw.trim().toLowerCase();
  if (v === "gemini" || v === "claude" || v === "openai" || v === "xai") return v;
  if (v === "grok") return "xai";
  return null;
}

// A global backbone selector: a single vendor for all reasoning seats, or
// "perPurpose" to defer to the PHASE2_VENDOR map.
export type LlmVendorMode = LlmVendor | "perPurpose";

// Read at call time (Expo inlines EXPO_PUBLIC_* literals at build time, same
// pattern as resolveReasoningProvider in gemini.ts).
export function llmPhase(): 1 | 2 {
  const raw = (process.env.EXPO_PUBLIC_LLM_PHASE ?? "1").trim();
  return raw === "2" ? 2 : 1;
}

// EXPO_PUBLIC_LLM_VENDOR — the operator's one-env backbone switch. Lets Simon
// pick which vendor serves the reasoning seats without a code edit:
//   gemini | claude | openai  → that vendor for EVERY reasoning seat
//   perPurpose                → use the per-seat PHASE2_VENDOR map
//   unset / unrecognized      → null (back-compat: Phase-1 = Gemini,
//                               Phase-2 = PHASE2_VENDOR map)
// Only the reasoning seats (PHASE2_VENDOR keys) are switchable; the Gemini
// backbone stayers (chat/classification/interview) and the OCR/voice/image pins
// are never routed to a reasoning proxy by this switch. Default posture is
// 100% Gemini ($0), unchanged.
export function llmVendorOverride(): LlmVendorMode | null {
  const raw = (process.env.EXPO_PUBLIC_LLM_VENDOR ?? "").trim().toLowerCase();
  const vendor = normalizeVendor(raw);
  if (vendor) return vendor;
  if (raw === "perpurpose") return "perPurpose";
  return null;
}

// EXPO_PUBLIC_CHAT_VENDOR — the one knob for 세컨비 대화 (secondb_chat).
//   gemini (or unset) → gemini-proxy, the behaviour shipped to date
//   openai            → openai-proxy   ← Simon's 2026-08-18 direction
//   claude            → claude-proxy
//
// Why chat gets its own knob instead of joining PHASE2_VENDOR: the seats in
// that map only activate at EXPO_PUBLIC_LLM_PHASE=2, and production is
// **Phase 1** (repo Variable, verified 2026-08-18 — every ai_audit_log row to
// date was served by gemini, including the nine "re-routed" seats). So flipping
// chat by way of Phase 2 would also switch nine other surfaces that have never
// once run in production. That is a much larger change than the one asked for.
//
// Simon asked to keep the choice open ("나중에 다시 선택할 여지를 남겨두자"), and
// a single purpose with a single variable is exactly that: one value to move
// chat between vendors, one value to put it back, no code edit, no redeploy.
//
// ⚠ ORDERING. openai-proxy rejects any purpose outside its allowlist with
// 400 purpose_not_seated BEFORE doing anything else. The seat added to that
// function in this change only exists once the function is **redeployed**.
// Set this variable before that deploy and every chat message fails. Deploy
// first, then flip -- the same trap as applying a migration after its client.
export function chatVendorOverride(): LlmVendor | null {
  return normalizeVendor(process.env.EXPO_PUBLIC_CHAT_VENDOR ?? "");
  return null;
}

// EXPO_PUBLIC_BACKBONE_VENDOR - the LAST Gemini surface.
//
// The three switches above move the reasoning seats, chat, and the multimodal
// pair. Nine purposes are in none of those groups and reached the vendor
// through a hardcoded `return "gemini"` below, with no variable able to move
// them: audit_qa, capture_classify, clipper_classify, clipper_template_propose,
// imagine, import_ingest, interview_probe, reasoning_connect, source_ingest.
// Eight of the nine have live call sites.
//
// That was correct while Gemini was the backbone by design. It stopped being
// correct when Simon retired Gemini as a vendor (2026-08-21) against a hard
// date: Google stops accepting Standard keys in September. Flipping the other
// three switches would have left classification, interview probes, imports and
// the deep-run rationale still calling a key that no longer works, and the
// failure would have looked like a vendor outage rather than a missed seat.
//
// Default stays "gemini", so this file behaves exactly as before until the
// variable is set. The proxy seats have to exist first - openai-proxy answers
// 400 purpose_not_seated for anything outside its allowlist BEFORE doing
// anything else, so this is the same deploy-then-flip ordering as chat.
// ⚠ "xai" is accepted here and WILL be refused by the proxy. That is the
// intended behaviour, not an oversight: the nine backbone purposes are the
// app's highest-volume surfaces, xai-proxy has no cheap Grok tier confirmed
// against the account, and seating them on the frontier model to make this
// setting "work" would be the most expensive mistake available. Unseated, the
// call answers purpose_not_seated - loud, and free. Seat them in xai-proxy when
// a cheap tier is confirmed, and this comment stops being true.
export function backboneVendor(): LlmVendor {
  return normalizeVendor(process.env.EXPO_PUBLIC_BACKBONE_VENDOR ?? "") ?? "gemini";
}

// OCR and voice memos are the two purposes that carry BINARY payloads, so they
// can only run on a vendor whose proxy forwards them.
//
// History, because the name of this set used to be the reason: Simon's
// 2026-07-04 directive pinned OCR to Gemini unconditionally, and it was ALSO
// technically forced — gemini-proxy was the only proxy that forwarded inline
// data. Simon retired Gemini as a vendor on 2026-08-21, and Google stops
// accepting Standard keys in September, so the pin had to become a choice
// instead of a fact. openai-proxy grew an image path and a transcription path
// (REQ-260821-01); this set now says WHICH purposes are multimodal, and
// multimodalVendor() says who serves them.
export const MULTIMODAL_PURPOSES: ReadonlySet<PromptPurpose> = new Set([
  "capture_ocr",
  "capture_voice",
]);

/** @deprecated Kept as an alias so nothing silently loses the pin while the
 *  Gemini exit is in flight. Read MULTIMODAL_PURPOSES in new code. */
export const GEMINI_PINNED_PURPOSES = MULTIMODAL_PURPOSES;

// Which vendor serves the binary-carrying purposes.
//
// ⚠ THE DEFAULT IS DELIBERATELY STILL GEMINI. openai-proxy only gained the
// image + transcription paths in this change, and an edge function does not
// carry code until it is REDEPLOYED. Flipping the default here would send OCR
// and voice memos to a function that answers `purpose_not_seated` for them
// until the deploy lands — the same deploy-before-flip trap as 0127/0130.
// The console flips EXPO_PUBLIC_MULTIMODAL_VENDOR=openai AFTER redeploying.
export function multimodalVendor(): LlmVendor {
  const raw = (process.env.EXPO_PUBLIC_MULTIMODAL_VENDOR ?? "").trim().toLowerCase();
  // "xai" is deliberately NOT accepted. xai-proxy has no image or audio path
  // and refuses an attachment outright, so allowing the value here would turn a
  // capability gap into a runtime 415 on every photo and voice memo. A vendor
  // that cannot carry a binary is not a choice for the binary-carrying seats.
  if (raw === "openai" || raw === "gemini") return raw;
  return "gemini";
}

// D-26 Phase 2 vendor seats. Anthropic carries the self-understanding
// narrative / advice surfaces (KO prose quality + anti-clinical nuance);
// everything absent from this map stays on the Gemini backbone.
// secondb_chat is intentionally ABSENT, but NOT for the reason this comment
// used to give. It said chat stays Gemini "until claude-proxy streaming lands,
// because a blocking chat surface cannot take a non-streaming proxy hop."
// That blocker does not exist (2026-08-18 measured):
//
//   - callLlm returns Promise<LlmResult<T>>, not a stream, and
//     conversation.ts awaits it exactly once (chat.ts sendChatMessage).
//   - gemini-proxy has no streaming path -- no SSE, no ReadableStream.
//   - the repo has NO streaming anywhere: zero hits for generateContentStream,
//     streamGenerateContent, text/event-stream, EventSource, or getReader().
//   - secondb.tsx renders the reply in one shot; there is no partial render.
//
// So chat has been taking a non-streaming proxy hop all along. Adding streaming
// to claude-proxy would not unblock anything, because nothing is blocked.
//
// The real gate is money, not transport. claude-proxy already HAS the seat
// configured (secondb_chat: 'claude-sonnet-5', effort 'low'), so moving chat is
// a one-line addition to PHASE2_VENDOR below. What stops it today is that the
// nine reasoning seats were re-routed off Anthropic on 2026-07-06 for an
// exhausted credit balance (see the note in PHASE2_VENDOR). Point chat at
// claude-proxy while that is still true and every message pays a failed hop
// before the D-26 failover drops it back to gemini-proxy.
//
// Flip this when Anthropic has credits -- that is an operator fact this file
// cannot check, so it stays a deliberate decision rather than a default.
export const PHASE2_VENDOR: Readonly<Partial<Record<PromptPurpose, LlmVendor>>> = {
  // Reasoning backend re-routed Claude -> OpenAI on 2026-07-06: the Anthropic
  // account's credit balance was exhausted (claude-proxy returned 502
  // "Your credit balance is too low"), so Simon chose the OpenAI backend. All
  // nine live reasoning seats now land on gpt-5.4 via openai-proxy, which
  // allowlists exactly these purposes. Revert to "claude" once Anthropic has
  // credits (claude-proxy is still deployed + keyed). Code-free revert:
  // EXPO_PUBLIC_LLM_VENDOR=claude routes every seat to claude-proxy immediately.
  // Which vendor served each call is audited (ai_audit_log.reasoning_vendor, 0095).
  // Pinned + revert-verified by phase2-vendor-stopgap.test.ts (R6).
  advisor: "openai",
  // V-4 (Simon, 2026-08-23): the two seats whose OUTPUT IS THE SENTENCE a user
  // reads move to Claude's opus seat. Simon overrode the recommendation to wait
  // until after the deadline; the $100 top-up removed the reason to wait.
  //
  // ⚠ THESE TWO LINES DO NOTHING ON THEIR OWN. Step 2 of
  // resolveVendorForPurpose returns EXPO_PUBLIC_LLM_VENDOR verbatim for every
  // seat, and the console set that to "openai" on 2026-08-23. While it holds a
  // vendor name, this map is never read. The operator flip that makes a
  // per-seat map mean anything is:
  //
  //     EXPO_PUBLIC_LLM_VENDOR=perPurpose
  //
  // which then sends these two to claude-proxy and the other ten to
  // openai-proxy, exactly as spelled out below.
  persona_narrative: "claude",
  gap_synthesize: "openai",
  self_model_propose: "openai",
  northstar_propose: "openai",
  axis_estimate: "openai",
  persona_synthesis: "claude",
  ops_recommend: "openai",
  ops_daily_brief: "openai",
  // Proto rev2 seats — digest_weekly, ttfv_first_insight, cluster_infer have no
  // client call site yet (defined in types.ts, never invoked), so these are
  // inert until wired; they share the OpenAI seat for consistency.
  digest_weekly: "openai",
  ttfv_first_insight: "openai",
  cluster_infer: "openai",
  // The two sides of the cross-check, deliberately on different vendors. This
  // pairing is the feature: crosscheck.ts refuses to run when they resolve to
  // the same one, because an adversary that shares a model with its subject is
  // not an adversary.
  crosscheck_challenge: "openai",
  crosscheck_defend: "claude",
};

// D-26 Phase 2 per-purpose reasoning effort. Abstract ladder; each proxy maps
// it to the vendor's native semantics (Anthropic output_config.effort /
// OpenAI reasoning_effort). Consulted only for non-Gemini seats — Gemini-tier
// effort behavior is unchanged (pro tier only, DEFAULT_EFFORT high).
export const PHASE2_EFFORT: Readonly<Partial<Record<PromptPurpose, ReasoningEffort>>> = {
  advisor: "high",
  persona_narrative: "high",
  gap_synthesize: "low",
  self_model_propose: "high",
  northstar_propose: "high",
  axis_estimate: "high",
  // max is Anthropic-only in practice: openai-proxy folds max into xhigh, so
  // asking for it costs nothing on the seats that stayed with OpenAI.
  persona_synthesis: "max",
  ops_recommend: "medium",
  ops_daily_brief: "medium",
  // Proto rev2 seats: digest_weekly + ttfv_first_insight are high-stakes ->
  // xhigh; cluster_infer's rationale is lighter -> medium.
  digest_weekly: "max",
  // The challenger reads a whole-corpus draft and looks for what is wrong with
  // it; the defender rewrites under that pressure and its output is what the
  // user reads, so it gets the top rung the same way persona_synthesis does.
  crosscheck_challenge: "high",
  crosscheck_defend: "max",
  ttfv_first_insight: "xhigh",
  cluster_infer: "medium",
  // secondb_chat is not a PHASE2_VENDOR seat (it routes via
  // EXPO_PUBLIC_CHAT_VENDOR), but it still needs an effort when that knob puts
  // it on a non-Gemini vendor: boundary.ts falls back to DEFAULT_EFFORT ("high")
  // otherwise, which would ask the app's highest-volume surface to reason hard
  // on every turn. Chat is conversational, not deliberative -> low. The proxies
  // clamp to the same ceiling server-side, so this is intent, not enforcement.
  secondb_chat: "low",
  // Backbone purposes (EXPO_PUBLIC_BACKBONE_VENDOR). They have no effort of
  // their own on Gemini - the TIER is the cost control there (PURPOSE_TIER
  // lite/flash/pro). Off Gemini the tier is gone, so the same intent has to be
  // said in effort, or boundary.ts falls back to DEFAULT_EFFORT ("high") and a
  // per-capture classifier starts reasoning hard on every note.
  //
  // The mapping is PURPOSE_TIER's own, not a new opinion:
  //   lite  -> low     (classification-shaped, high volume, no nuance needed.
  //                     The client vocabulary bottoms out at "low"; the real
  //                     floor for these two is the SERVER ceiling 'none' in
  //                     openai-proxy's PURPOSE_EFFORT_MAX, which a stale or
  //                     tampered client cannot raise. Said in both places
  //                     because only one of them is enforcement.)
  //   flash -> low     (interactive, structured, not deliberative)
  //   pro   -> medium  (reasoning; medium rather than high because these are
  //                     the two cheapest pro rows and nothing measured yet says
  //                     the extra depth changes the output - raise it on evidence)
  capture_classify: "low",
  clipper_classify: "low",
  audit_qa: "low",
  source_ingest: "low",
  import_ingest: "low",
  clipper_template_propose: "low",
  interview_probe: "low",
  // V-5 (Simon, 2026-08-23): "아니오 - high 유지." The proposal in
  // docs/LLM-VENDOR-PLACEMENT.md was to run these two at medium; Simon refused
  // the reduction, so they sit at high with the other pro-tier seats.
  //
  // Read together with the server ceiling: the client ASKS for an effort and
  // openai-proxy CLAMPS it. Raising this to high while leaving the ceiling at
  // medium would clamp it straight back down - the answer would look applied
  // and change nothing. Both moved.
  reasoning_connect: "high",
  imagine: "high",
};

/**
 * Resolve the vendor seat for a call. Image-bearing calls are ALWAYS Gemini
 * (belt-and-suspenders on top of the pinned set — no other proxy forwards
 * inline data).
 */
export function resolveVendorForPurpose(purpose: PromptPurpose, hasImage: boolean): LlmVendor {
  // 1) Anything carrying a binary goes to the multimodal vendor, and that still
  //    beats every switch below: a text-only proxy cannot serve these at all,
  //    so this is a capability constraint before it is a preference.
  if (hasImage || MULTIMODAL_PURPOSES.has(purpose)) return multimodalVendor();

  // 1b) Chat has its own vendor knob, independent of phase and of the seat
  //     switch. Placed after the image/OCR pin so an image-bearing turn still
  //     goes to Gemini (no other proxy forwards inline data), and before the
  //     seat logic so chat never depends on Phase 2 being on. Unset → falls
  //     through to the Gemini backbone exactly as before.
  if (purpose === "secondb_chat") {
    return chatVendorOverride() ?? "gemini";
  }

  // Only the reasoning SEATS are vendor-switchable. Every other purpose
  // (secondb_chat, high-volume classification, interview probes) stays on the
  // Gemini backbone regardless of the switch, so the operator can never
  // accidentally route chat or a cheap classifier through a reasoning proxy.
  // ("streaming chat" here was a misnomer -- nothing in this repo streams;
  // see the note above PHASE2_VENDOR.)
  const isSeat = purpose in PHASE2_VENDOR;

  // 2) EXPO_PUBLIC_LLM_VENDOR global override, when set.
  const override = llmVendorOverride();
  if (override) {
    // The seat switch deliberately does NOT reach the backbone: an operator
    // moving the reasoning seats must not silently re-route a cheap classifier
    // through a reasoning proxy. The backbone has its own switch for that.
    if (!isSeat) return backboneVendor();
    if (override === "perPurpose") return PHASE2_VENDOR[purpose] ?? "gemini";
    return override; // gemini | claude | openai — applied to every seat
  }

  // 3) Unset → back-compat: Phase-1 = Gemini for the SEATS; Phase-2 = the
  //    per-seat map. Non-seat purposes take the backbone switch instead, which
  //    defaults to Gemini, so this line reads the same as before for them.
  if (!isSeat) return backboneVendor();
  if (llmPhase() !== 2) return "gemini";
  return PHASE2_VENDOR[purpose] ?? "gemini";
}

/** D-26 Phase 2 effort default for a purpose (non-Gemini seats only). */
export function phase2EffortFor(purpose: PromptPurpose): ReasoningEffort | undefined {
  return PHASE2_EFFORT[purpose];
}

export function proxyFnForVendor(vendor: LlmVendor | undefined): LlmProxyFn {
  if (vendor === "claude") return "claude-proxy";
  if (vendor === "openai") return "openai-proxy";
  if (vendor === "xai") return "xai-proxy";
  return "gemini-proxy";
}

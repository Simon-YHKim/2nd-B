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

export type LlmVendor = "gemini" | "claude" | "openai";
export type LlmProxyFn = "gemini-proxy" | "claude-proxy" | "openai-proxy";

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
  if (raw === "gemini" || raw === "claude" || raw === "openai") return raw;
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
  const raw = (process.env.EXPO_PUBLIC_CHAT_VENDOR ?? "").trim().toLowerCase();
  if (raw === "gemini" || raw === "claude" || raw === "openai") return raw;
  return null;
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
  persona_narrative: "openai",
  gap_synthesize: "openai",
  self_model_propose: "openai",
  northstar_propose: "openai",
  axis_estimate: "openai",
  persona_synthesis: "openai",
  ops_recommend: "openai",
  ops_daily_brief: "openai",
  // Proto rev2 seats — digest_weekly, ttfv_first_insight, cluster_infer have no
  // client call site yet (defined in types.ts, never invoked), so these are
  // inert until wired; they share the OpenAI seat for consistency.
  digest_weekly: "openai",
  ttfv_first_insight: "openai",
  cluster_infer: "openai",
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
  persona_synthesis: "xhigh",
  ops_recommend: "medium",
  ops_daily_brief: "medium",
  // Proto rev2 seats: digest_weekly + ttfv_first_insight are high-stakes ->
  // xhigh; cluster_infer's rationale is lighter -> medium.
  digest_weekly: "xhigh",
  ttfv_first_insight: "xhigh",
  cluster_infer: "medium",
  // secondb_chat is not a PHASE2_VENDOR seat (it routes via
  // EXPO_PUBLIC_CHAT_VENDOR), but it still needs an effort when that knob puts
  // it on a non-Gemini vendor: boundary.ts falls back to DEFAULT_EFFORT ("high")
  // otherwise, which would ask the app's highest-volume surface to reason hard
  // on every turn. Chat is conversational, not deliberative -> low. The proxies
  // clamp to the same ceiling server-side, so this is intent, not enforcement.
  secondb_chat: "low",
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
    if (!isSeat) return "gemini";
    if (override === "perPurpose") return PHASE2_VENDOR[purpose] ?? "gemini";
    return override; // gemini | claude | openai — applied to every seat
  }

  // 3) Unset → back-compat: Phase-1 = 100% Gemini; Phase-2 = per-seat map.
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
  return "gemini-proxy";
}

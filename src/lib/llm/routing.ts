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

// Owner directive (Simon, 2026-07-04): OCR runs on Gemini UNCONDITIONALLY —
// every phase, no vendor failover, no exceptions. It is also technically
// forced: only gemini-proxy forwards image inline-data (claude/openai proxies
// are text-only). capture_voice ships audio and is likewise Gemini-pinned
// (on-device STT first, Vertex fallback — D-26 A13).
export const GEMINI_PINNED_PURPOSES: ReadonlySet<PromptPurpose> = new Set([
  "capture_ocr",
  "capture_voice",
]);

// D-26 Phase 2 vendor seats. Anthropic carries the self-understanding
// narrative / advice surfaces (KO prose quality + anti-clinical nuance);
// everything absent from this map stays on the Gemini backbone.
// secondb_chat is intentionally ABSENT: it stays Gemini until claude-proxy
// streaming lands (D-26 A1 interim — a blocking chat surface cannot take a
// non-streaming proxy hop).
export const PHASE2_VENDOR: Readonly<Partial<Record<PromptPurpose, LlmVendor>>> = {
  // Reasoning backend re-routed Claude -> OpenAI on 2026-07-06: the Anthropic
  // account's credit balance was exhausted (claude-proxy returned 502
  // "Your credit balance is too low"), so Simon chose the OpenAI backend. All
  // nine live reasoning seats now land on gpt-5.4 via openai-proxy, which
  // allowlists exactly these purposes. Revert to "claude" once Anthropic has
  // credits (claude-proxy is still deployed + keyed).
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
};

/**
 * Resolve the vendor seat for a call. Image-bearing calls are ALWAYS Gemini
 * (belt-and-suspenders on top of the pinned set — no other proxy forwards
 * inline data).
 */
export function resolveVendorForPurpose(purpose: PromptPurpose, hasImage: boolean): LlmVendor {
  // 1) Image / OCR / voice pin — ALWAYS Gemini, highest priority. Beats the
  //    global switch too (only gemini-proxy forwards inline data / audio).
  if (hasImage || GEMINI_PINNED_PURPOSES.has(purpose)) return "gemini";

  // Only the reasoning SEATS are vendor-switchable. Every other purpose
  // (secondb_chat streaming, high-volume classification, interview probes)
  // stays on the Gemini backbone regardless of the switch, so the operator can
  // never accidentally route streaming chat or a cheap classifier through a
  // reasoning proxy.
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

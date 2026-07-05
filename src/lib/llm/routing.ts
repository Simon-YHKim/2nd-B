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

// Read at call time (Expo inlines EXPO_PUBLIC_* literals at build time, same
// pattern as resolveReasoningProvider in gemini.ts).
export function llmPhase(): 1 | 2 {
  const raw = (process.env.EXPO_PUBLIC_LLM_PHASE ?? "1").trim();
  return raw === "2" ? 2 : 1;
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
  advisor: "claude",
  persona_narrative: "claude",
  gap_synthesize: "claude",
  self_model_propose: "claude",
  northstar_propose: "claude",
  axis_estimate: "claude",
  persona_synthesis: "claude",
  ops_recommend: "claude",
  ops_daily_brief: "claude",
  // Proto rev2 seats. digest_weekly + ttfv_first_insight take the Anthropic
  // (opus/sonnet) narrative seat. cluster_infer is designed for the OpenAI
  // (gpt-5.4) seat, but until OPENAI_API_KEY is provisioned in Supabase Secrets
  // it is TEMPORARILY routed to Claude so Phase 2 can activate without a dead
  // cluster path (probe 2026-07-06: ANTHROPIC key set, OPENAI key missing).
  // Revert to "openai" (and set the key) to light the gpt-5.4 cluster seat.
  digest_weekly: "claude",
  ttfv_first_insight: "claude",
  cluster_infer: "claude",
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
  if (hasImage || GEMINI_PINNED_PURPOSES.has(purpose)) return "gemini";
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

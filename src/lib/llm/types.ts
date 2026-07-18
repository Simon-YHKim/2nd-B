import type { SafetyResult, SafetyZone } from "../safety/classifier";

export type GeminiModel = "lite" | "flash" | "pro";

// Reasoning effort levels. On the Gemini pro tier this maps to a generation
// config in gemini.ts (thinking budget + maxOutputTokens); on D-26 Phase 2
// vendor seats the edge proxies translate it to the vendor's native ladder
// (Anthropic output_config.effort / OpenAI reasoning_effort). Default is
// "high". Effort is a PURPOSE property, never a subscription-tier property:
// the SAME-QUALITY invariant (entitlements/tiers.ts) forbids tier-keyed
// model/effort/quality differences — tiers differ by counts and features
// only. See docs/LLM-ROUTING.md.
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type PromptPurpose =
  | "audit_qa"
  // D-26 A14 rename: knowledge_lookup -> source_ingest (the wiki 4-question
  // source intake). Old audit rows keep the historical label (text column; no
  // migration needed) — see docs/LLM-ROUTING.md §4 감사 연속성.
  | "source_ingest"
  // The /reasoning deep-run domain-link batches (0092 lifecycle). Formerly
  // mislabeled journal_reflect (records) / knowledge_lookup (sources) — both
  // D-26 폐기/개명 대상. Deliberately its OWN purpose, NOT cluster_infer: that
  // seat is reserved for the wiki cluster rationale and is Phase-2 mapped to
  // OpenAI, while the deep run stays on the Gemini backbone until the Phase-2
  // cutover decides its seat. Old audit rows keep the historical labels.
  | "reasoning_connect"
  // D-26 taxonomy split: the old catch-all "persona_chat" covered three
  // semantically different call-sites with different Phase 2 seats. Split so
  // routing + audit attribution are per-situation. Old audit rows keep the
  // historical label (text column; no migration needed).
  | "persona_narrative" // 2-3 sentence anti-Barnum persona summary (build.ts)
  | "gap_synthesize" // self-vs-others gap note (seen-lens; numeric input only)
  | "self_model_propose" // propose->ratify self-model change JSON
  | "advisor"
  | "secondb_chat"
  | "interview_probe"
  | "capture_ocr"
  | "capture_voice"
  | "capture_classify"
  | "clipper_classify"
  | "clipper_template_propose"
  | "import_ingest"
  | "imagine"
  | "ops_recommend"
  | "ops_daily_brief" // D-26 A17: all-domain ops recommendations in ONE daily call
  | "persona_synthesis"
  | "northstar_propose"
  | "axis_estimate"
  // Proto rev2 (docs/LLM-ROUTING.md §2) AI surfaces declared in the routing
  // matrix so a Phase-2 flip delivers the FULL proto matrix instead of a partial
  // one. Call-site wiring (LLM digest narrative, semantic cluster rationale, TTFV
  // first-insight precompute) is a separate feature per purpose; these are the
  // routing seats they will use.
  | "digest_weekly" // weekly two-signal causal pattern (highest-stakes claim)
  | "cluster_infer" // semantic wiki connection rationale (activates the OpenAI seat)
  | "ttfv_first_insight"; // first-day self-understanding, evidence-backed

export interface AdvisorInput {
  userId: string;
  userMessage: string;
  locale: "en" | "ko";
  userAgeRange?: "young_adult" | "adult" | "midlife" | "elderly";
  conversationContext?: string;
  // C10 safety: when the signed-in user is a minor (<18; in practice 14-17),
  // crisis routing surfaces the youth line (KO -> 1388 alongside 109). Threaded
  // from AuthContext.isMinor by callers. Defaults to adult routing when unset.
  minor?: boolean;
  // Reasoning effort for the Advisor (pro/reasoning tier). Defaults to "high".
  // Purpose-keyed only — never derived from the subscription tier
  // (SAME-QUALITY invariant, entitlements/tiers.ts).
  effort?: ReasoningEffort;
}

export interface AdvisorResult {
  text: string;
  zone: "green" | "yellow" | "red";
  triggers: string[];
  cssrsLevel: number | null;
  fixedTemplate: boolean;
  matchedBatches: string[];
  evidence: { title: string; doi: string | null; summary: string | null }[];
  audit: AuditMeta;
}

export interface PromptInput {
  userId: string;
  locale: "en" | "ko";
  purpose: PromptPurpose;
  system?: string;
  user: string;
  model?: GeminiModel;
  // When provided, response is constrained to this JSON schema (Gemini structured output).
  responseSchema?: Record<string, unknown>;
  // Optional inline image for multimodal prompts (OCR, vision). Base64 *only*,
  // no `data:` URL prefix. Mime allowlist + size cap enforced server-side by
  // the gemini-proxy Edge Function.
  image?: { mimeType: string; data: string };
  // C10 safety: when the signed-in user is a minor (<18; in practice 14-17),
  // crisis routing points to a youth-appropriate hotline (KO -> 1388). Defaults
  // to adult routing when unset. Threaded from AuthContext.isMinor by callers.
  minor?: boolean;
  // Optional client-side cancellation for UI-owned LLM calls. C9/C3 ordering
  // still holds for any request that reaches the model; a pre-aborted signal
  // exits before egress.
  signal?: AbortSignal;
  // Reasoning effort. Only honored on the pro (reasoning) tier — when this call
  // resolves to pro (explicit model:"pro" or a pro-tier purpose). Defaults to
  // "high". Ignored on lite/flash tiers. Purpose-keyed only, never
  // subscription-tier-keyed (SAME-QUALITY). See gemini.ts effortToConfig().
  effort?: ReasoningEffort;
}

export interface AuditMeta {
  promptHash: string;
  outputHash: string;
  modelUsed: string;
  vertexBackend: boolean;
  safetyZone: SafetyZone;
  latencyMs: number;
  // Reasoning effort recorded for traceability (C3). Set on the pro
  // (reasoning) tier AND on D-26 Phase 2 vendor-seat calls (where the proxy
  // maps it to the vendor's native ladder); undefined on plain Gemini
  // lite/flash calls and on crisis-routed / classifier paths where no
  // reasoning effort was used.
  effort?: ReasoningEffort;
  // Vendor backend for the call ("gemini" default). "claude"/"openai" when a
  // D-26 Phase 2 purpose seat (or the legacy EXPO_PUBLIC_REASONING_PROVIDER
  // seam) routed the call through claude-proxy / openai-proxy. Recorded so the
  // audit trail shows which backend produced the answer.
  reasoningProvider?: "gemini" | "claude" | "openai";
}

export interface GeminiResult<T = string> {
  text: T;
  safety: SafetyResult;
  audit: AuditMeta;
}

// 3-tier model ids. ENV-overridable so the owner can bump generations later
// (e.g. to 3.x) WITHOUT a code change — set EXPO_PUBLIC_MODEL_LITE / _FLASH /
// _PRO. Defaults stay on the current-safe 2.5 family (do NOT hard-switch).
//   lite  — cheap/fast: safety classify, embed-like, high-volume capture/clip.
//   flash — interactive: chat, OCR/voice, lookups, ingest, template propose.
//   pro   — reasoning: advisor, journal reflection, interview probe, imagine.
// Read at module load (Expo inlines EXPO_PUBLIC_* at build time). The ?? guards
// empty-string env values too, so a blank var falls back to the safe default.
export const MODELS: Record<GeminiModel, string> = {
  lite:
    (process.env.EXPO_PUBLIC_MODEL_LITE && process.env.EXPO_PUBLIC_MODEL_LITE.trim()) ||
    "gemini-2.5-flash-lite",
  flash:
    (process.env.EXPO_PUBLIC_MODEL_FLASH && process.env.EXPO_PUBLIC_MODEL_FLASH.trim()) ||
    "gemini-2.5-flash",
  pro:
    (process.env.EXPO_PUBLIC_MODEL_PRO && process.env.EXPO_PUBLIC_MODEL_PRO.trim()) ||
    "gemini-2.5-pro",
};

// Purpose -> default tier. Used by callGemini ONLY when the caller does not pass
// an explicit `model`. An explicit `input.model` always wins. Existing callers
// preserved: callGemini's historical default was "flash" and callAdvisor uses
// "pro" directly (advisor is not routed through this map), so no purpose here
// regresses a current default. Purposes absent from the map fall back to "flash"
// (the historical callGemini default) in purposeToTier().
//   lite  — classify/embed-like (cheap, high volume)
//   flash — interactive surfaces
//   pro   — reasoning surfaces
export const PURPOSE_TIER: Partial<Record<PromptPurpose, GeminiModel>> = {
  // lite: classification-shaped, high volume, no nuance needed
  capture_classify: "lite",
  clipper_classify: "lite",
  // flash: interactive / structured-but-not-deep
  secondb_chat: "flash",
  persona_narrative: "flash",
  gap_synthesize: "flash",
  self_model_propose: "flash",
  capture_ocr: "flash",
  capture_voice: "flash",
  ops_recommend: "flash",
  ops_daily_brief: "flash",
  audit_qa: "flash",
  source_ingest: "flash",
  import_ingest: "flash",
  clipper_template_propose: "flash",
  // 북극성 persona synthesis (layer C). v1 flash (CONSTELLATION-DESIGN §17-f);
  // promote to "pro" if persona quality needs deeper reasoning.
  persona_synthesis: "flash",
  // Interview probe drafts ONE question per turn; the depth-layer choice is
  // deterministic (nextLayerSuggestion), so pro-tier reasoning added cost and
  // latency without measurable question quality (routing decision D-26,
  // docs/LLM-ROUTING.md A4). Demoted pro -> flash.
  interview_probe: "flash",
  // Previously unmapped (fell through to the flash fallback in purposeToTier).
  // Made explicit so a future default change cannot silently re-route them.
  //
  // Spend policy (Simon decision 2026-07-06): both northstar_propose and
  // axis_estimate stay INTENTIONALLY un-metered at the per-feature level — no
  // per-user usage cap, open to every tier. They are self-understanding
  // proposals the user must ratify, run at most a few times, and cost is already
  // bounded by the global proxy spend cap (bump_gemini_spend / reasoning-cap
  // RPC). Add a per-feature gate here only if abuse telemetry shows a need.
  northstar_propose: "flash",
  axis_estimate: "flash",
  // pro: reasoning / nuance
  advisor: "pro",
  // The /reasoning deep-run batches (call sites also pass model:"pro"
  // explicitly since #1063; this row makes the table agree with them).
  reasoning_connect: "pro",
  imagine: "pro",
  // Proto rev2 routing seats. digest_weekly is the highest-stakes causal claim
  // -> pro on the Gemini backbone; cluster_infer (now live: the /reasoning
  // domain-link batches, which pass model:"pro" explicitly per the #1063
  // implementation — explicit model wins over this table) and
  // ttfv_first_insight are structured/precompute -> flash.
  digest_weekly: "pro",
  cluster_infer: "flash",
  ttfv_first_insight: "flash",
};

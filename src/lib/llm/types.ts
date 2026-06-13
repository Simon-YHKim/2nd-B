import type { SafetyResult, SafetyZone } from "../safety/classifier";

export type GeminiModel = "flash" | "pro";

export type PromptPurpose =
  | "journal_reflect"
  | "audit_qa"
  | "knowledge_lookup"
  | "persona_chat"
  | "advisor"
  | "secondb_chat"
  | "interview_probe"
  | "capture_ocr"
  | "capture_classify"
  | "clipper_classify"
  | "clipper_template_propose"
  | "import_ingest"
  | "imagine"
  | "ops_recommend";

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
}

export interface AuditMeta {
  promptHash: string;
  outputHash: string;
  modelUsed: string;
  vertexBackend: boolean;
  safetyZone: SafetyZone;
  latencyMs: number;
}

export interface GeminiResult<T = string> {
  text: T;
  safety: SafetyResult;
  audit: AuditMeta;
}

export const MODELS: Record<GeminiModel, string> = {
  flash: "gemini-2.5-flash",
  pro: "gemini-2.5-pro",
} as const;

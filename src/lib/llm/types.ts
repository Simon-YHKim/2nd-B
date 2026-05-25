import type { SafetyResult, SafetyZone } from "../safety/classifier";

export type GeminiModel = "flash" | "pro";

export type PromptPurpose =
  | "journal_reflect"
  | "audit_qa"
  | "knowledge_lookup"
  | "persona_chat"
  | "advisor";

export interface AdvisorInput {
  userId: string;
  userMessage: string;
  locale: "en" | "ko";
  userAgeRange?: "young_adult" | "adult" | "midlife" | "elderly";
  conversationContext?: string;
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

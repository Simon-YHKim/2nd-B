import { getSupabaseClient } from "./client";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const PROCESSING_LOG_PAGE_SIZE = 50;
export const PROCESSING_LOG_SELECT = "id, created_at, purpose, reasoning_vendor, model_used";

export type ProcessingLogPurpose =
  | "reflection"
  | "source"
  | "connection"
  | "self-understanding"
  | "conversation"
  | "capture"
  | "import"
  | "planning"
  | "summary"
  | "crosscheck"
  | "safety"
  | "voice"
  | "other";

export type ProcessingLogProvider =
  | "google-gemini"
  | "anthropic-claude"
  | "openai"
  | "xai"
  | null;

export interface ProcessingLogRow {
  /** Stable list key only. The UI must not display this identifier. */
  id: string;
  createdAt: string;
  /** User-facing category. The raw database purpose never crosses this boundary. */
  purpose: ProcessingLogPurpose;
  /** Allowlisted provider. Unknown database values collapse to null. */
  provider: ProcessingLogProvider;
  /** A recognised public model name without internal outcome markers. */
  model: string | null;
}

export interface ProcessingLogWindow {
  sinceIso: string;
  untilIso: string;
}

export interface ProcessingLogPage {
  rows: ProcessingLogRow[];
  hasMore: boolean;
  nextOffset: number;
}

const PURPOSE_CATEGORY: Readonly<Record<string, ProcessingLogPurpose>> = {
  audit_qa: "reflection",
  interview_probe: "reflection",
  source_ingest: "source",
  reasoning_connect: "connection",
  cluster_infer: "connection",
  embed_index: "connection",
  persona_narrative: "self-understanding",
  gap_synthesize: "self-understanding",
  self_model_propose: "self-understanding",
  persona_synthesis: "self-understanding",
  northstar_propose: "self-understanding",
  axis_estimate: "self-understanding",
  imagine: "self-understanding",
  ttfv_first_insight: "self-understanding",
  advisor: "planning",
  ops_recommend: "planning",
  ops_daily_brief: "planning",
  secondb_chat: "conversation",
  capture_ocr: "capture",
  capture_voice: "capture",
  capture_classify: "capture",
  clipper_classify: "capture",
  clipper_template_propose: "capture",
  import_ingest: "import",
  digest_weekly: "summary",
  crosscheck_challenge: "crosscheck",
  crosscheck_defend: "crosscheck",
  safety_classify: "safety",
  voice_transcribe: "voice",
};

const PROVIDER: Readonly<Record<string, Exclude<ProcessingLogProvider, null>>> = {
  gemini: "google-gemini",
  claude: "anthropic-claude",
  openai: "openai",
  xai: "xai",
};

// Only public model-family names are useful to a person reviewing their data.
// Internal audit markers (`mock:`, `none-*`, `+swap:*`, `+refusal`, ...)
// deliberately fail or are stripped before this value leaves the reader.
const PUBLIC_MODEL = /^(?:(?:gemini|claude|gpt|grok|text-embedding)-[a-z0-9][a-z0-9._-]{0,78}|o[1-9](?:-[a-z0-9][a-z0-9._-]{0,76})?)$/;
const INTERNAL_MODEL_PREFIXES = ["mock:", "none:", "none-crisis-routed"] as const;
const PROVIDER_MODEL: Record<Exclude<ProcessingLogProvider, null>, RegExp> = {
  "google-gemini": /^gemini-/,
  "anthropic-claude": /^claude-/,
  openai: /^(?:gpt-|o[1-9](?:-|$)|text-embedding-)/,
  xai: /^grok-/,
};

export function normalizeProcessingLogPurpose(value: unknown): ProcessingLogPurpose {
  return typeof value === "string" ? PURPOSE_CATEGORY[value] ?? "other" : "other";
}

export function normalizeProcessingLogProvider(value: unknown): ProcessingLogProvider {
  if (typeof value !== "string") return null;
  return PROVIDER[value.trim().toLowerCase()] ?? null;
}

export function normalizeProcessingLogModel(
  value: unknown,
  provider: ProcessingLogProvider,
): string | null {
  if (typeof value !== "string" || provider === null) return null;
  const normalized = value.trim().toLowerCase();
  if (INTERNAL_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return null;
  const publicName = normalized.split("+", 1)[0];
  return PUBLIC_MODEL.test(publicName) && PROVIDER_MODEL[provider].test(publicName)
    ? publicName
    : null;
}

export function createProcessingLogWindow(nowMs = Date.now()): ProcessingLogWindow {
  if (!Number.isFinite(nowMs)) throw new Error("A finite processing-log clock is required");
  return {
    sinceIso: new Date(nowMs - SEVEN_DAYS_MS).toISOString(),
    untilIso: new Date(nowMs).toISOString(),
  };
}

function mapRow(value: unknown): ProcessingLogRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.created_at !== "string") return null;
  const provider = normalizeProcessingLogProvider(row.reasoning_vendor);
  return {
    id: row.id,
    createdAt: row.created_at,
    purpose: normalizeProcessingLogPurpose(row.purpose),
    provider,
    model: normalizeProcessingLogModel(row.model_used, provider),
  };
}

export async function listProcessingLogPage({
  userId,
  window,
  offset = 0,
}: {
  userId: string;
  window: ProcessingLogWindow;
  offset?: number;
}): Promise<ProcessingLogPage> {
  const scopedUserId = userId.trim();
  if (!scopedUserId) throw new Error("A user id is required for the processing log");
  if (!Number.isInteger(offset) || offset < 0) throw new Error("A non-negative page offset is required");

  // Fetch one look-ahead row. `range` is inclusive, so offset + PAGE_SIZE
  // returns PAGE_SIZE + 1 rows and tells the caller whether another page exists.
  const { data, error } = await getSupabaseClient()
    .from("ai_audit_log")
    .select(PROCESSING_LOG_SELECT)
    .eq("user_id", scopedUserId)
    .gte("created_at", window.sinceIso)
    .lte("created_at", window.untilIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PROCESSING_LOG_PAGE_SIZE);

  if (error) throw error;
  const rawRows = Array.isArray(data) ? data : [];
  const pageRows = rawRows.slice(0, PROCESSING_LOG_PAGE_SIZE);
  return {
    rows: pageRows.map(mapRow).filter((row): row is ProcessingLogRow => row !== null),
    hasMore: rawRows.length > PROCESSING_LOG_PAGE_SIZE,
    nextOffset: offset + pageRows.length,
  };
}

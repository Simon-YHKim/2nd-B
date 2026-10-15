// Untrusted external AI output. Never repair input or fall back to raw text.
export const PROFILE_CONTEXT_MAX_BYTES = 256 * 1024;
export const PROFILE_CONTEXT_CATEGORIES = ["basic_fact", "preference", "value", "goal", "constraint", "experience", "interest", "pattern"] as const;
export type ContextCategory = typeof PROFILE_CONTEXT_CATEGORIES[number];
export type ContextBasis = "user_statement" | "memory_summary" | "assistant_inference" | "unknown";
export interface ContextSource {
  id: string; kind: "chat_excerpt" | "memory_entry"; speaker: "user" | "assistant" | "unknown";
  conversation_id: string | null; message_id: string | null; label: string | null;
  occurred_at: string | null; excerpt: string | null;
}
export interface ContextItem {
  id: string; category: ContextCategory; statement: string; reported_basis: ContextBasis;
  evidence_ids: string[]; valid_time: { from: string | null; to: string | null; description: string | null };
  conflicts_with: string[];
}
export interface ProfileContext {
  format: "polascope.user-context"; version: "1.0-draft";
  origin: { service: string; model: string | null; exported_at: string | null };
  coverage: { accessed: string[]; unavailable: string[]; omissions: string[]; more_items: string; account_completeness: "unknown" };
  sources: ContextSource[]; items: ContextItem[];
}
export class ProfileContextError extends Error {
  constructor(public readonly code: "size" | "syntax" | "contract" | "references" | "selection") {
    super(`profile_context_${code}`);
  }
}
function requireValue(value: unknown, code: ProfileContextError["code"] = "contract"): asserts value {
  if (!value) throw new ProfileContextError(code);
}

/** JSON reader: duplicate keys and deep nesting must not disappear in JSON.parse. */
function strictJson(text: string): unknown {
  let at = 0;
  const space = () => { while (at < text.length && /\s/.test(text[at])) at++; };
  function readString(): string {
    const match = /^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/.exec(text.slice(at));
    requireValue(match, "syntax"); at += match[0].length;
    return JSON.parse(match[0]) as string;
  }
  function value(depth: number): unknown {
    requireValue(depth <= 8, "syntax"); space();
    const ch = text[at];
    if (ch === '"') return readString();
    if (ch === "{" || ch === "[") {
      at++; space();
      const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const array: unknown[] = []; const keys = new Set<string>(); const end = ch === "{" ? "}" : "]";
      if (text[at] !== end) {
        while (true) {
          space();
          if (ch === "{") {
            const key = readString();
            requireValue(!keys.has(key) && !["__proto__", "constructor", "prototype"].includes(key), "syntax");
            keys.add(key); space(); requireValue(text[at++] === ":", "syntax"); obj[key] = value(depth + 1);
          } else { array.push(value(depth + 1)); }
          space(); if (text[at] === end) break;
          requireValue(text[at++] === ",", "syntax");
        }
      }
      at++; return ch === "{" ? obj : array;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    requireValue(match, "syntax"); at += match[0].length; return JSON.parse(match[0]) as unknown;
  }
  const parsed = value(0); space(); requireValue(at === text.length, "syntax"); return parsed;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  const result = value as Record<string, unknown>;
  requireValue(Object.keys(result).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(result, key)));
  return result;
}
function string(value: unknown, max: number, nullable = false): void {
  requireValue(nullable && value === null || typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
}
function enumeration(value: unknown, options: readonly string[]): void { requireValue(typeof value === "string" && options.includes(value)); }
function list(value: unknown, max: number): unknown[] { requireValue(Array.isArray(value) && value.length <= max); return value; }
function strings(value: unknown, max: number, length: number): string[] {
  const items = list(value, max); items.forEach((v) => string(v, length));
  requireValue(new Set(items).size === items.length); return items as string[];
}
function date(value: unknown, timestampOnly = false): void {
  if (value === null) return;
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value));
  requireValue(!timestampOnly || value.length > 10);
  const prefix = value.slice(0, 10); const day = new Date(prefix + "T00:00:00Z");
  requireValue(Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === prefix && Number.isFinite(Date.parse(value)));
}
function validateSource(value: unknown): void {
  const s = object(value, ["id", "kind", "speaker", "conversation_id", "message_id", "label", "occurred_at", "excerpt"]);
  string(s.id, 64); enumeration(s.kind, ["chat_excerpt", "memory_entry"]); enumeration(s.speaker, ["user", "assistant", "unknown"]);
  string(s.conversation_id, 128, true); string(s.message_id, 128, true); string(s.label, 160, true); string(s.excerpt, 300, true); date(s.occurred_at);
}
function validateItem(value: unknown): void {
  const item = object(value, ["id", "category", "statement", "reported_basis", "evidence_ids", "valid_time", "conflicts_with"]);
  string(item.id, 64); string(item.statement, 800); enumeration(item.category, PROFILE_CONTEXT_CATEGORIES);
  enumeration(item.reported_basis, ["user_statement", "memory_summary", "assistant_inference", "unknown"]);
  strings(item.evidence_ids, 20, 64); strings(item.conflicts_with, 49, 64);
  const time = object(item.valid_time, ["from", "to", "description"]);
  date(time.from); date(time.to); string(time.description, 160, true);
  requireValue(time.from === null || time.to === null || Date.parse(time.from as string) <= Date.parse(time.to as string));
}
export function parseProfileContext(raw: string): ProfileContext {
  requireValue(raw.length <= PROFILE_CONTEXT_MAX_BYTES && new TextEncoder().encode(raw).length <= PROFILE_CONTEXT_MAX_BYTES, "size");
  const text = raw.trim().replace(/^\uFEFF/, "");
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text);
  const result = object(strictJson(fence ? fence[1] : text), ["format", "version", "origin", "coverage", "sources", "items"]);
  requireValue(result.format === "polascope.user-context" && result.version === "1.0-draft");
  const origin = object(result.origin, ["service", "model", "exported_at"]);
  enumeration(origin.service, ["chatgpt", "claude", "gemini", "other", "unknown"]); string(origin.model, 100, true); date(origin.exported_at, true);
  const coverage = object(result.coverage, ["accessed", "unavailable", "omissions", "more_items", "account_completeness"]);
  strings(coverage.accessed, 4, 32).forEach((v) => enumeration(v, ["current_chat", "provided_memory", "attached_records", "retrieved_chats"]));
  strings(coverage.unavailable, 20, 160); strings(coverage.omissions, 20, 160);
  enumeration(coverage.more_items, ["yes", "no", "unknown"]); requireValue(coverage.account_completeness === "unknown");
  list(result.sources, 100).forEach(validateSource); list(result.items, 50).forEach(validateItem);
  const document = result as unknown as ProfileContext;
  const sourceIds = new Set(document.sources.map((s) => s.id)); const itemIds = new Set(document.items.map((i) => i.id));
  requireValue(sourceIds.size === document.sources.length && itemIds.size === document.items.length, "references");
  document.items.forEach((item) => {
    requireValue(item.evidence_ids.every((id) => sourceIds.has(id)), "references");
    requireValue(item.conflicts_with.every((id) => id !== item.id && itemIds.has(id)), "references");
  });
  return document;
}

export type ReviewedContext = Record<string, { selected: boolean; statement: string; confirmed: boolean }>;
export function needsContextConfirmation(_item: ContextItem, _sources: readonly ContextSource[]): boolean {
  // External provenance claims never authorize an item, including user_statement.
  return true;
}
export function selectAllContext(document: ProfileContext, review: ReviewedContext, selected: boolean): ReviewedContext {
  return Object.fromEntries(document.items.map((item) => [item.id, {
    ...review[item.id], selected: selected && (!needsContextConfirmation(item, document.sources) || review[item.id]?.confirmed === true),
  }]));
}
/** Revalidate edits and prune all unselected text, sources and conflict references. */
export function selectedProfileContext(document: ProfileContext, review: ReviewedContext): { document: ProfileContext; confirmedIds: string[] } {
  const selected = document.items.filter((i) => review[i.id]?.selected);
  requireValue(selected.length > 0 && selected.every((i) => !needsContextConfirmation(i, document.sources) || review[i.id].confirmed), "selection");
  const itemIds = new Set(selected.map((i) => i.id)); const sourceIds = new Set(selected.flatMap((i) => i.evidence_ids));
  const next = {
    ...document,
    coverage: { ...document.coverage, unavailable: [], omissions: [] },
    items: selected.map((i) => ({ ...i, statement: review[i.id].statement.trim(), conflicts_with: i.conflicts_with.filter((id) => itemIds.has(id)) })),
    sources: document.sources.filter((s) => sourceIds.has(s.id)),
  };
  return { document: parseProfileContext(JSON.stringify(next)), confirmedIds: selected.filter((i) => review[i.id].confirmed).map((i) => i.id) };
}

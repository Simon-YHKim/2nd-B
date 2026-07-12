// Structured form payloads (Simon-ratified 2026-07-03): when a capture is
// written through a form-shaped template (4W1H, career 3C4P Drill Down), the
// record keeps BOTH a human-readable flattened body and a machine-readable
// JSON payload in records.structured, so the system and the AI read the
// structure instead of re-parsing prose.
//
// Pure module: no I/O, no React. records.structured (migration 0066) stores
// exactly the StructuredPayload shape below.

import { FOURW_LABEL, type FourWKey } from "./fourw";

export const STRUCTURED_FORMS = ["fourw", "career_3c4p", "call_reflection"] as const;
export type StructuredForm = (typeof STRUCTURED_FORMS)[number];

export interface StructuredPayload {
  form: StructuredForm;
  version: 1;
  /** Field key -> trimmed user text. Empty fields are dropped at compose time. */
  fields: Record<string, string>;
}

/** Build a payload from raw form state; empty/whitespace fields are dropped.
 *  Returns null when nothing was filled in (callers then skip the column). */
export function composeStructured(
  form: StructuredForm,
  fields: Record<string, string>,
): StructuredPayload | null {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const v = (value ?? "").trim();
    if (v.length > 0) kept[key] = v;
  }
  if (Object.keys(kept).length === 0) return null;
  return { form, version: 1, fields: kept };
}

/** Defensive parse of an unknown DB value back into a payload (or null). */
export function parseStructured(raw: unknown): StructuredPayload | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.form !== "string" || !STRUCTURED_FORMS.includes(o.form as StructuredForm)) return null;
  if (o.version !== 1) return null;
  if (o.fields == null || typeof o.fields !== "object" || Array.isArray(o.fields)) return null;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.fields as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) fields[k] = v;
  }
  if (Object.keys(fields).length === 0) return null;
  return { form: o.form as StructuredForm, version: 1, fields };
}

/** Compact single-record rendering for AI context blocks: one header line then
 *  one "key: value" line per field. Values are clipped so a handful of records
 *  stays small inside the chat context cap. */
export function renderStructuredForContext(
  payload: StructuredPayload,
  opts?: { valueCharLimit?: number },
): string {
  const limit = opts?.valueCharLimit ?? 160;
  const lines = [`[form:${payload.form}]`];
  for (const [key, value] of Object.entries(payload.fields)) {
    const v = value.length > limit ? `${value.slice(0, limit)}…` : value;
    lines.push(`${key}: ${v}`);
  }
  return lines.join("\n");
}

// Human-readable field label for the structured-payload grid (record detail).
// Before this the grid printed the raw machine key (who / when / exp_type) as
// the label in EVERY locale. 4W1H reuses the canonical FOURW_LABEL; call-
// reflection has its own small map; everything else (career 3C4P's many keys)
// degrades to a humanized key (snake_case -> "Title case") rather than a raw
// identifier.
const CALL_REFLECTION_LABEL: Record<"en" | "ko", Record<string, string>> = {
  ko: { who_label: "누구", gist: "요지", feeling: "감정", followup: "후속" },
  en: { who_label: "Who", gist: "Gist", feeling: "Feeling", followup: "Follow-up" },
};

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function structuredFieldLabel(form: StructuredForm, key: string, locale: "en" | "ko"): string {
  if (form === "fourw" && key in FOURW_LABEL[locale]) {
    return FOURW_LABEL[locale][key as FourWKey];
  }
  if (form === "call_reflection" && key in CALL_REFLECTION_LABEL[locale]) {
    return CALL_REFLECTION_LABEL[locale][key];
  }
  return humanizeKey(key);
}

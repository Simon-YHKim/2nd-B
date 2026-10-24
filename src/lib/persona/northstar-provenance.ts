import type { SystemTaggedRow } from "../records/system-tags";

export const NORTHSTAR_TAG = "northstar_sentence";
export const NORTHSTAR_AI_TAG = "northstar_sentence:ai";

/** Exact UTF-16 fingerprint, with two FNV-1a lanes. No trim or normalization:
 *  even whitespace edits break attribution. This is an edit check, not proof
 *  against a writer who can replace both body and system_tags. */
export function northstarAiTag(body: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < body.length; i++) {
    a = Math.imul(a ^ body.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ body.charCodeAt(i), 0x01000193);
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, "0");
  // 41 ASCII characters, within 0218's [A-Za-z0-9_.:-]{1,64} shape.
  return `${NORTHSTAR_AI_TAG}:v1:${hex(a)}${hex(b)}`;
}

export function hasNorthstarAiProvenance(
  row: (SystemTaggedRow & { body?: string | null }) | null | undefined,
): boolean {
  // Bare markers from the first draft have no body evidence. Never infer
  // attribution from those, or from the editable user-tag column.
  return typeof row?.body === "string" && row.body.trim().length > 0 &&
    row.system_tags?.includes(northstarAiTag(row.body)) === true;
}

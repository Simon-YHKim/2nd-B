// T10 slice 1: preparation only. No conversation, transport or preference writer imports this module.
// Activation also needs the numbered server contract, Relay, approved copy, T71 and real-model QA.
// Q-261018-45 postpones T65: do not claim a retention period or no-training setting.
import { classifyInputAnyLocale } from "../safety/classifier";
import { hasCrisisObfuscation } from "../safety/crisis-obfuscation";

export const RECORD_READ_ENABLED: boolean = false;
export const RECORD_READ_PURPOSE = "llm_record_body";
export const RECORD_BODY_CHAR_LIMIT = 600;

export function recordReadAllowed(isMinor: boolean | null, consent: unknown): boolean {
  return RECORD_READ_ENABLED && isMinor === false && consent === true;
}

// The future R reader must supply current ownership/version/hold/health evidence.
// Missing evidence is excluded, not inferred from a body's wording. No date cutoff.
export interface RecordBodyCandidate {
  id: string;
  userId: string;
  kind: "note" | "journal";
  body: string;
  relevance: number;
  aiHold: boolean;
  supersededBy: string | null;
  containsHealthMeasurements: boolean;
}

export interface RecordBodyExcerpt { id: string; body: string }

// Conservative local pattern masking, not a claim to recognize every contact/account format.
// Normalize width and invisible separators before matching, and mask BEFORE truncating.
export function maskRecordBodyIdentifiers(body: string): string {
  return body.normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[email]")
    .replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/gi, "[account]")
    // Seven or more digits, including local/international phones and numeric accounts.
    .replace(/\+?\d(?:[\s().\-/]*\d){6,}/g, "[number]");
}

export function selectRecordBodyExcerpts(
  candidates: readonly RecordBodyCandidate[], userId: string, limit: number,
): RecordBodyExcerpt[] {
  // N is deliberately a caller input: the decision says top N; N<=5 is only a legal draft recommendation.
  if (!userId || !Number.isSafeInteger(limit) || limit <= 0) return [];
  const ids = new Set<string>();
  return candidates.filter(record =>
    record.userId === userId && typeof record.id === "string" && record.id.length > 0 &&
    (record.kind === "note" || record.kind === "journal") &&
    record.aiHold === false && record.supersededBy === null && record.containsHealthMeasurements === false &&
    Number.isFinite(record.relevance) && record.relevance > 0 &&
    typeof record.body === "string" && record.body.trim().length > 0 &&
    classifyInputAnyLocale(record.body, "en", { minor: false }).zone !== "red" &&
    !hasCrisisObfuscation(record.body),
  ).sort((a, b) => b.relevance - a.relevance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter(record => { if (ids.has(record.id)) return false; ids.add(record.id); return true; })
    .slice(0, limit)
    .map(record => ({ id: record.id, body: Array.from(maskRecordBodyIdentifiers(record.body)).slice(0, RECORD_BODY_CHAR_LIMIT).join("") }));
}

export interface RecordBodyAudit { recordId: string; bodyHash: string }

// Hashing belongs to the existing boundary. This pure projector only accepts SHA-256 hex;
// it never spreads a record, stores text or returns a caller-supplied diagnostic payload.
export function recordBodyAudit(recordId: string, bodyHash: string): RecordBodyAudit {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId) ||
      !/^[0-9a-f]{64}$/i.test(bodyHash)) throw new Error("invalid_record_body_audit");
  return { recordId, bodyHash: bodyHash.toLowerCase() };
}

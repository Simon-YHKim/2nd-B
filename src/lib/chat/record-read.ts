// T10 slice 1: preparation only. No conversation, transport or preference writer imports this module.
// Activation also needs the numbered server contract, Relay, approved copy, T71 and real-model QA.
// Q-261018-45 postpones T65: do not claim verified organisation settings.
import { classifyInputAnyLocale } from "../safety/classifier";
import { hasCrisisObfuscation } from "../safety/crisis-obfuscation";

export const RECORD_READ_ENABLED: boolean = false;
export const RECORD_READ_PURPOSE = "llm_record_body";
export const RECORD_BODY_CHAR_LIMIT = 600;
export const RECORD_BODY_COUNT_LIMIT = 5;

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
  return body.normalize("NFKC").replace(/[\u00AD\u180E\u200B-\u200D\u2060\uFEFF]/g, "")
    // Bound every component, including labels: no unbounded suffix search on
    // long unspaced notes. Spaces/(at) are common copied contact spellings.
    .replace(/[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]{1,64}[ \t]{0,8}(?:@|\(at\))[ \t]{0,8}[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){1,8}/giu, "[email]")
    // Grouped IBANs use four-character blocks, with a numeric tail. Requiring
    // eight digits avoids treating FY24/CS50 plus ordinary prose as an account.
    .replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){2,7}[ -]?\d{1,4}\b/gi,
      value => (value.match(/\d/g)?.length ?? 0) >= 8 ? "[account]" : value)
    // Preserve dates, year ranges and monetary amounts (legal S7). Horizontal
    // separators only: adjacent lines of numbers must never become one phone.
    .replace(/(?<keep>\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{4}[-–]\d{4}\b|[$€£¥₩][ \t]*\d[\d,.]*|\b\d[\d,.]*[ \t]*(?:(?:만|억|천)?원|달러|유로|USD|EUR|KRW))|(?<number>\+?\d(?:[ \t()./\-\u2010-\u2015\u2212·\u119E_]*\d){6,})/gu,
      (value, _keep, _number, _offset, _source, groups: { keep?: string }) => {
        if (groups.keep) return value;
        const digits = value.replace(/\D/g, "");
        // Bare small counts/amounts are not identifiers. Formatted contacts,
        // resident numbers and longer account/card shapes are masked locally.
        return digits.length >= 9 || /[+()./\-\u2010-\u2015\u2212·\u119E_]/u.test(value) ? "[number]" : value;
      });
}

export function selectRecordBodyExcerpts(
  candidates: readonly RecordBodyCandidate[], userId: string, limit: number, isMinor: boolean | null,
): RecordBodyExcerpt[] {
  // Simon's "all recommended" instruction adopts legal's maximum N=5.
  if (isMinor !== false || !userId || !Number.isSafeInteger(limit) || limit <= 0) return [];
  const ids = new Set<string>();
  return candidates.filter(record =>
    record.userId === userId && typeof record.id === "string" && record.id.length > 0 &&
    (record.kind === "note" || record.kind === "journal") &&
    record.aiHold === false && record.supersededBy === null && record.containsHealthMeasurements === false &&
    Number.isFinite(record.relevance) && record.relevance > 0 &&
    typeof record.body === "string" && record.body.trim().length > 0 &&
    classifyInputAnyLocale(record.body, "en", { minor: isMinor }).zone !== "red" &&
    !hasCrisisObfuscation(record.body),
  ).sort((a, b) => b.relevance - a.relevance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter(record => { if (ids.has(record.id)) return false; ids.add(record.id); return true; })
    .slice(0, Math.min(limit, RECORD_BODY_COUNT_LIMIT))
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

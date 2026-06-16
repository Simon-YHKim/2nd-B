// PII scrub + reversible tokenization for the §1 ingest gate (queue D, core).
//
// Presidio (the design's reference) is Python and can't run in the RN client or
// the Deno edge runtime, so the full PII pass is regex/checksum here PLUS an
// LLM NER pass (names/addresses) that lives in `gemini-proxy` — see the handoff:
// this module is the pure, deterministic regex/checksum layer, shared logic the
// server enforcement point ports. ENFORCEMENT is server-side (A2: a client-only
// scrub can be bypassed by a raw request), so this is the detector library, not
// the trust boundary on its own.
//
// Reversible by design: each match is replaced with a stable placeholder token
// and recorded in a token table, so a later step can `restorePii()` the
// original where it's needed (e.g. to write the un-scrubbed clip to the user's
// own private storage) while the scrubbed form is what reaches the LLM.
//
// Pure, dependency-free, deterministic: same input → same scrub + same tokens.

export type PiiKind = "email" | "krrrn" | "card" | "phone" | "ipv4";

export interface PiiToken {
  /** Placeholder that replaced the match, e.g. "[[PII:email:1]]". */
  token: string;
  kind: PiiKind;
  /** The original matched substring (for restore). */
  value: string;
}

export interface ScrubResult {
  scrubbed: string;
  tokens: PiiToken[];
}

// Detector order matters: more specific / structured patterns first so a Korean
// resident-registration number isn't half-eaten by the generic phone pattern,
// and card numbers (Luhn-checked) are claimed before loose digit runs.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// KR RRN: 6 digits - 7 digits (YYMMDD-Sxxxxxx).
const KR_RRN = /\b\d{6}-\d{7}\b/g;
// 13-19 digit runs, optionally separated by spaces/hyphens — Luhn-validated.
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
// KR + generic phone: optional +country, groups of 2-4 digits with - or space.
const PHONE = /(?:\+?\d{1,3}[ -]?)?(?:0\d{1,2}|\(\d{2,3}\))[ -]?\d{3,4}[ -]?\d{4}\b/g;
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

function luhnValid(digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

interface Detector {
  kind: PiiKind;
  re: RegExp;
  accept?: (match: string) => boolean;
}

const DETECTORS: Detector[] = [
  { kind: "email", re: EMAIL },
  { kind: "krrrn", re: KR_RRN },
  { kind: "card", re: CARD, accept: luhnValid },
  { kind: "ipv4", re: IPV4 },
  { kind: "phone", re: PHONE },
];

// Placeholders never re-match a detector: they carry no '@', no 13+ digit run,
// no dotted-quad, and the single counter digit can't satisfy the phone group
// shape. So running detectors sequentially over the partially-tokenized text is
// safe.
function placeholder(kind: PiiKind, n: number): string {
  return `[[PII:${kind}:${n}]]`;
}

/**
 * Replace detected PII with stable placeholder tokens. Returns the scrubbed
 * text and the token table needed to restore it. Counters are per-kind and
 * assigned in first-appearance order, so the output is deterministic.
 */
export function scrubPii(text: string): ScrubResult {
  const tokens: PiiToken[] = [];
  const counters: Record<string, number> = {};
  let out = text;

  for (const det of DETECTORS) {
    out = out.replace(det.re, (match) => {
      if (det.accept && !det.accept(match)) return match;
      counters[det.kind] = (counters[det.kind] ?? 0) + 1;
      const token = placeholder(det.kind, counters[det.kind]);
      tokens.push({ token, kind: det.kind, value: match });
      return token;
    });
  }

  return { scrubbed: out, tokens };
}

/**
 * Inverse of `scrubPii`: substitute each placeholder back to its original
 * value. `restorePii(scrubPii(t).scrubbed, scrubPii(t).tokens) === t`.
 */
export function restorePii(scrubbed: string, tokens: PiiToken[]): string {
  let out = scrubbed;
  for (const t of tokens) out = out.split(t.token).join(t.value);
  return out;
}

/** True when any PII was detected — a quick gate-side signal. */
export function hasPii(text: string): boolean {
  return scrubPii(text).tokens.length > 0;
}

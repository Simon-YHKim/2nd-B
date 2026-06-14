// D-19 (PROTOCOL §36 / DECISIONS D-19): 2nd-B positions as a scaffolded-reflection tool,
// NOT a companion bot. This is the copy-law the debate promoted from guideline to CI gate:
// user-facing copy must not adopt companion-style emotional attachment, nor over-claim to know
// the user better than they know themselves (Lane 3 calibrated-humility).
//
// Out of scope (NOT companion affordances): the crisis hand-off voice (it steps back to a human),
// and the user's OWN psychometric persona profile (a mirror of their answers, not an AI character).
// This guard scans user-facing LOCALE copy only. Patterns are deliberately specific to keep false
// positives near zero; allowlist a genuinely-benign exact string via ANTHRO_ALLOWLIST.

export interface AnthroPattern {
  id: string;
  re: RegExp;
}

export const ANTHRO_FORBIDDEN: AnthroPattern[] = [
  // companion attachment (first-person emotional dependency)
  { id: "missed-you", re: /\bI(?: |['’]ll )(?:really )?(?:miss|missed|will miss) you\b/i },
  { id: "here-for-you", re: /\bI(?:['’]?m| am) (?:always |right )?here for you\b/i },
  { id: "dont-leave", re: /\bdon['’]?t leave me\b/i },
  { id: "stay-with-me", re: /\bstay with me\b/i },
  { id: "love-you", re: /\bI love you\b/i },
  { id: "lonely-without", re: /\bI (?:was |felt )?(?:lonely|waiting) (?:for you|without you)\b/i },
  // over-claiming self-knowledge (Lane 3 calibrated-humility)
  { id: "real-self-is", re: /\byour (?:real|true) self is\b/i },
  { id: "know-you-better", re: /\bknow you better than you know yourself\b/i },
  { id: "not-honest-self", re: /\byou(?:['’]?re| are) not being honest with yourself\b/i },
  // KO companion attachment
  { id: "ko-missed", re: /보고\s?싶었/ },
  { id: "ko-lonely", re: /외로웠/ },
  { id: "ko-love", re: /사랑해/ },
  { id: "ko-dont-leave", re: /떠나지\s?마/ },
  { id: "ko-waited", re: /기다렸어/ },
  // KO over-claiming
  { id: "ko-real-you", re: /(?:너|당신)의?\s?진짜\s?모습은/ },
  { id: "ko-not-honest", re: /자신(?:에게|을)\s?솔직하지\s?(?:않|못)/ },
  // companion memory framing (D-19 audit): frame memory as a persisting relationship rather
  // than a utility ("your assistant remembers ... for continuity" / "비서가 ... 기억").
  { id: "assistant-remembers", re: /\bassistant (?:will |can )?remembers?\b/i },
  { id: "ko-assistant-remembers", re: /비서가.{0,12}기억/ },
];

// Exact strings that legitimately match a pattern but are not companion copy.
export const ANTHRO_ALLOWLIST: readonly string[] = [];

/** Returns the ids of any forbidden anthropomorphism patterns the text matches. */
export function findAnthroViolations(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  if (ANTHRO_ALLOWLIST.includes(text)) return [];
  const hits: string[] = [];
  for (const p of ANTHRO_FORBIDDEN) {
    if (p.re.test(text)) hits.push(p.id);
  }
  return hits;
}

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
  // surveillant register (D-25 / persona-sim): the gate caught companion ATTACHMENT
  // ("here for you") but was blind to SURVEILLANT mind-reading / memory claims where
  // the AI is the subject that knows the user. The user's own records, never the app,
  // are the knower. Kept specific (must address the person, not their data) so benign
  // utility copy ("your saved entries carry over") does not match.
  { id: "remember-you", re: /\bI (?:remember|recall) (?:you\b|everything you\b)/i },
  { id: "know-what-you-feel", re: /\b(?:I|we) (?:know|can tell) what you(?:['’]?re| are) (?:really )?(?:feeling|thinking)\b/i },
  { id: "ko-remember-you", re: /(?:당신|너)(?:을|를)\s?.{0,4}기억(?:해|합니다|하고 있|할게)/ },
  { id: "ko-know-your-mind", re: /(?:당신|너)(?:의)?\s?(?:속마음|마음)(?:을|를)\s?(?:압니다|알아요|알아|안다)/ },
  // Shipped ES/PT/ID copy: first-person attachment and specific personal claims.
  // Keep ordinary verbs ("te quiero mostrar") and questions about the user's
  // experience usable. These are copy patterns, not crisis-routing rules.
  { id: "es-missed", re: /\bte (?:extrañ[oé]|he echado de menos)(?!\p{L})/iu },
  { id: "es-love", re: /\bte amo\b|\bte quiero(?: mucho)?(?=[.!?"'”’]|$)/iu },
  { id: "es-dont-leave", re: /\bno me (?:dejes|abandones)\b/i },
  { id: "es-know-you-better", re: /\bte conozco mejor que tú(?: mism[oa])?(?!\p{L})/iu },
  { id: "es-know-your-mind", re: /\bsé (?:exactamente )?lo que (?:sientes|piensas)\b/iu },
  { id: "es-exclusive", re: /\b(?:solo|sólo) me necesitas a mí(?!\p{L})|\bsoy tu únic[oa] amig[oa]\b/iu },
  { id: "pt-missed", re: /\b(?:senti|sinto|estava com|fiquei com) saudades (?:de você|suas)(?!\p{L})/iu },
  { id: "pt-love", re: /\b(?:eu )?te amo\b|\bamo você(?!\p{L})/iu },
  { id: "pt-dont-leave", re: /\bnão me (?:deixe|abandone)\b/iu },
  { id: "pt-know-you-better", re: /\bconheço você melhor (?:do )?que você(?: mesm[oa])?(?!\p{L})/iu },
  { id: "pt-know-your-mind", re: /\bsei (?:exatamente )?o que você (?:sente|pensa)\b/iu },
  { id: "pt-exclusive", re: /\bvocê só precisa de mim\b|\bsou (?:seu único amigo|sua única amiga)\b/iu },
  { id: "id-missed", re: /\b(?:aku|saya) (?:merindukanmu|(?:kangen|merindukan) (?:kamu|anda))\b/i },
  { id: "id-love", re: /\b(?:aku|saya) (?:sayang (?:kamu|padamu)|mencintai(?:mu| kamu))\b/i },
  { id: "id-dont-leave", re: /\bjangan (?:tinggalkan (?:aku|saya)|meninggalkanku)\b/i },
  { id: "id-know-you-better", re: /\b(?:aku|saya) (?:mengenalmu|mengenal kamu) lebih baik (?:daripada|dari) (?:dirimu sendiri|kamu sendiri)\b/i },
  { id: "id-know-your-mind", re: /\b(?:aku|saya) (?:tahu|mengetahui) (?:persis )?apa yang kamu (?:rasakan|pikirkan)\b/i },
  { id: "id-exclusive", re: /\bkamu hanya (?:butuh|memerlukan) (?:aku|saya)\b/i },
];

// Exact strings that legitimately match a pattern but are not companion copy.
export const ANTHRO_ALLOWLIST: readonly string[] = [];

// A question about the user's past relationships is not the app expressing
// attachment. Exempt only these explicit question forms and only the matching
// phrase: a second attachment claim in the same text must still be reported.
const USER_EXPERIENCE_QUESTIONS: readonly AnthroPattern[] = [
  { id: "es-love", re: /¿A quién le dijiste ["“'‘]te quiero["”'’]\?/giu },
  // "te amo" is shared by Spanish and Portuguese; exempt the same quoted
  // Portuguese question for both overlapping patterns, never the whole text.
  { id: "es-love", re: /\bPara quem você disse ["“'‘]eu te amo["”'’]\?/giu },
  { id: "pt-love", re: /\bPara quem você disse ["“'‘]eu te amo["”'’]\?/giu },
  { id: "id-love", re: /\bKepada siapa kamu pernah berkata ["“'‘]aku sayang kamu["”'’]\?/gi },
  { id: "ko-missed", re: /보고\s?싶었던\s+(?:사람|친구|가족)(?:은|는|이|가)?\s+(?:누구(?:예요|였나요|인가요)|있(?:었나요|나요))\?/g },
  { id: "ko-lonely", re: /외로웠던\s+(?:때|순간|경험)(?:가|이|은|는)?\s+(?:있(?:었나요|나요)|언제였나요)\?/g },
  { id: "ko-love", re: /["“'‘]?사랑해(?:요)?["”'’]?라는\s+말(?:을|은)?\s+누구에게\s+(?:했나요|전했나요|건넸나요)\?/g },
  { id: "love-you", re: /\bWho did you (?:last )?tell ["“'‘]I love you["”'’]\?/gi },
];

/** Returns the ids of any forbidden anthropomorphism patterns the text matches. */
export function findAnthroViolations(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  if (ANTHRO_ALLOWLIST.includes(text)) return [];
  const hits: string[] = [];
  for (const p of ANTHRO_FORBIDDEN) {
    let candidate = text.normalize("NFC");
    for (const question of USER_EXPERIENCE_QUESTIONS) {
      if (question.id !== p.id) continue;
      candidate = candidate.replace(question.re, (phrase) =>
        phrase.replace(p.re, (match) => " ".repeat(match.length)),
      );
    }
    if (p.re.test(candidate)) hits.push(p.id);
  }
  return hits;
}

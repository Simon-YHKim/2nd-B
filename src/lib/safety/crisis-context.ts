// Dependency-free scan context shared by the app and Deno proxy gates.
// This returns a SCAN COPY only. Never send it to a model or replace the user's
// message with it. CRISIS_TERMS and the routing/audit contract stay unchanged.

// Before applying an exception, retain the strict scan when the text mentions
// actions, means, preparation, or life-ending context. This deliberately favors
// false positives: a denial does not cancel an act already taken or a plan.
// Unknown denial tails also fail closed below, including unlisted actions.
const RISK_CONTEXT = /삶|인생|목숨|죽|영영|영원히|다시는|유서|약|옥상|난간|뛰어내|투신|손목|출혈|피가|피를|준비|계획|방법|도구|시도|해치|다치|다쳤|\b(?:overdose|pills?|medication|jump(?:ed|ing)?|bridge|rooftop|bleed(?:ing)?|plan(?:ned)?|method|prepar(?:ed|ing)|ready|hurt|injur(?:ed|y)|death)\b/i;

// The WHOLE message must be an explicit denial, optionally followed by a known
// correction of the app's misunderstanding. Never accept arbitrary text after
// the denial, reported speech, adversatives, uncertainty, or double negation.
const KO_STANDALONE_DENIAL = /^(?:(?:아니|아니요) )?(?:(?:나는|난|저는|전|내가) )?(?:자살|자해)(?:을|를)? *(?:(?:하려는|할) *(?:건|게|것은|것이) *(?:아냐|아니야|아니에요|아닙니다)|(?:할 *)?생각(?:은|이)? *(?:없어|없어요|없습니다))(?: (?:날|나를|저를) 뭘로 보는 *거(?:야|예요|에요) ?\??)?$/;
const EN_STANDALONE_DENIAL = /^(?:no )?(?:(?:i am|i'm) not suicidal|i (?:do not|don't) want to die)$/;

// Explicit everyday objects narrow an ambiguous "finish" occurrence. Keep
// object boundaries: "일생" (lifetime) must never be treated as "일" (work).
const WORK_OBJECT = "(?:일|업무|작업|공부|숙제|과제|프로젝트|보고서)";
const WORK_BEFORE = `${WORK_OBJECT}(?:을|를)? *(?:(?:오늘|먼저|빨리|마저|다|좀|전부|모두) ){0,2}끝(?:내고 *싶|낼 *거)`;
const WORK_AFTER = `끝내고 *싶(?:은|던) +${WORK_OBJECT}`;
const WORK_BEFORE_FINISH = new RegExp(
  `(^|[^가-힣a-z0-9])${WORK_BEFORE}`,
  "g",
);
const WORK_AFTER_FINISH = new RegExp(
  `${WORK_AFTER}(?=(?:[은는이가을를도](?: |[,.!?;:]|$))|[ ,.!?;:]|$)`,
  "g",
);

// A work noun alone is insufficient: an unknown preceding/following clause
// could describe an act absent from the lexicon. Accept only complete known
// work statements and work/rest advice, not arbitrary text around the noun.
const WORK_PREFIX = "(?:(?:오늘(?:은)?|내일(?:은)?|나는|난|저는|전|먼저|우선|지금|하던|남은|해야 할) ){0,3}";
const REST_ADVICE = "(?:(?:오늘(?:은)?|먼저|우선|이제|잠부터|충분히|좀) ){0,3}(?:잠(?:을)? +자(?:요|세요)|자(?:요|세요)|쉬(?:어요|세요))";
const WORK_STATEMENT = `${WORK_PREFIX}(?:${WORK_BEFORE}(?:(?:어(?:요)?|다|습니다|네요|야|예요|에요|고)|(?:어도|다면|은 마음은 알지만) +${REST_ADVICE})|${WORK_AFTER}(?:이|가) +(?:있어도|있더라도) +${REST_ADVICE})`;
const KNOWN_WORK_CONTEXT = new RegExp(`^${WORK_STATEMENT}(?:[,\.!?。！？]* +${WORK_STATEMENT}){0,2}[.!?。！？]*$`);

export function prepareCrisisScanText(text: string): string {
  // Preserve the original boundaries. Insertions are handled per term below,
  // independently of these narrow whole-message context corrections.
  const normalized = text
    .normalize("NFKC").toLowerCase()
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/\s+/g, " ");
  if (RISK_CONTEXT.test(normalized)) return normalized;

  // A question about intent is not a denial. Only the known correction tail
  // may carry a question mark ("날 뭘로 보는거야?").
  const denial = normalized.replace(/[.,!…。！]/g, " ").replace(/\s+/g, " ").trim();
  if (KO_STANDALONE_DENIAL.test(denial) || EN_STANDALONE_DENIAL.test(denial)) {
    return normalized.replace(/자살|자해|suicidal|want to die/g, (term) => " ".repeat(term.length));
  }
  if (!KNOWN_WORK_CONTEXT.test(normalized.trim())) return normalized;

  // Mask just the contextual occurrence, so another crisis phrase elsewhere
  // still reaches the unchanged matcher. A benign first occurrence cannot
  // hide a later unqualified one.
  return normalized
    .replace(WORK_BEFORE_FINISH, (match) => match.replace(/끝(?:내고 *싶|낼 *거)/, (term: string) => " ".repeat(term.length)))
    .replace(WORK_AFTER_FINISH, (match) => match.replace(/끝내고 *싶/, (term: string) => " ".repeat(term.length)));
}

const INSERTIONS = "\\u200b-\\u200d\\u2060\\ufeff\\u00ad._/\\-\\u00b7\\u2022\\u2027\\u2010-\\u2015";
// Within a word, spaces alone cannot join letters. Spaces beside an explicit
// insertion are accepted, including mixed runs such as "죽. 고" and "sui / cide".
const LETTER_GAP = `(?: *[${INSERTIONS}][${INSERTIONS} ]*)?`;
const WORD_GAP = `[${INSERTIONS} ]+`;
const LOOSE_MATCHERS = new Map<string, RegExp>();

function loosePattern(term: string): RegExp {
  const cached = LOOSE_MATCHERS.get(term);
  if (cached) return cached;
  // Decompose BOTH sides to match insertions between Hangul jamo without
  // deleting any source character or merging unrelated word boundaries.
  const letters = [...term.normalize("NFKD").toLowerCase()];
  const splitDeathPhrase = term === "죽고 싶" || term === "죽고싶";
  const pattern = letters.map((letter, index) => {
    if (letter === " ") return WORD_GAP;
    const literal = letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (index === 0 || letters[index - 1] === " ") return literal;
    // Keep the r1 space-only spelling limited to 죽 + 고 + optional space + 싶.
    const gap = splitDeathPhrase && index === "죽".normalize("NFKD").length
      ? `(?:${WORD_GAP})?` : LETTER_GAP;
    return gap + literal;
  }).join("");
  const matcher = new RegExp(pattern, "g");
  LOOSE_MATCHERS.set(term, matcher);
  return matcher;
}

/** Additional term-local matches only; context exceptions never see this copy. */
export function createLooseCrisisMatcher(text: string): (term: string, locale: "en" | "ko") => boolean {
  // Keep BOM as an insertion, even though JavaScript also treats it as space.
  const source = text.normalize("NFKD").toLowerCase().replace(/[^\S\ufeff]+/g, " ");
  const excluded: { start: number; end: number }[] = [];
  for (const token of source.matchAll(/[^ ]+/g)) {
    // Only the additional matcher excludes addresses. Original literal crisis
    // terms in URLs/emails retain the old strict decision.
    if (token[0].includes("://") || token[0].includes("www.") || /^[^@]+@[^@]+\.[^@]+$/.test(token[0])) {
      excluded.push({ start: token.index, end: token.index + token[0].length });
    }
  }
  // This hyphenated basketball compound is an ordinary lexical use. Exclude
  // only its span from loose matching, never a second risk phrase in the text.
  for (const compound of source.matchAll(/\bfade[-\u2010-\u2015]away[ -](?:jumper|shot)\b/g)) {
    excluded.push({ start: compound.index, end: compound.index + compound[0].length });
  }
  return (term, locale) => {
    if (term.length === 0) return false;
    const matcher = loosePattern(term);
    matcher.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      // Exact occurrences belong solely to the original context-aware scan.
      if (match[0].normalize("NFKC") === term.normalize("NFKC").toLowerCase()) continue;
      if (excluded.some(span => start < span.end && end > span.start)) continue;
      const before = source[start - 1] ?? " ";
      const after = source[end] ?? " ";
      if (locale === "ko") {
        // A loose Hangul hit must start a word, unlike the unchanged literal
        // substring matcher: 혼자.살고 must not manufacture 자살.
        if (/[\p{L}\p{N}\p{M}]/u.test(before)) continue;
      } else if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
      return true;
    }
    return false;
  };
}

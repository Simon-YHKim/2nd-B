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
const KO_NOT_INTENDING = "(?:을|를)? *(?:(?:하려는|할) *(?:건|게|것은|것이) *(?:아냐|아니야|아니에요|아닙니다)|(?:할 *)?생각(?:은|이)? *(?:없어|없어요|없습니다))";
const KO_CORRECTION_TAIL = "(?:날|나를|저를) 뭘로 보는 *거(?:야|예요|에요) ?\\??";
const KO_STANDALONE_DENIAL = new RegExp(`^(?:(?:아니|아니요) )?(?:(?:나는|난|저는|전|내가) )?(?:자살|자해)${KO_NOT_INTENDING}(?: ${KO_CORRECTION_TAIL})?$`);
// Plain refusals as people type them ("자살 안 해", "나 자살은 안 할 거야.", "자살하지 않아요")
// are denials too (Simon 2026-10-11, Q-261011-12). This test keeps the punctuation, like the
// English one below: a mark inside the sentence is a break ("자살 안. 해."), so marks may only
// follow the "아니" lead-in or close the sentence. Present or future, about the speaker, and
// the whole message: a time limit in front ("아직은", "오늘은"), the past ("안 했어"), a hedge
// ("안 할 것 같아"), a question, or anything after it keeps the strict scan.
const KO_PLAIN_REFUSAL = "(?:을|를|은|는)? *(?:안 *(?:해|해요|합니다|한다|할 *거야|할 *거예요|할 *거에요|할 *겁니다|할게|할게요)|하지(?:는)? *(?:않아|않아요|않습니다|않는다|않을 *거야|않을 *거예요|않을 *거에요|않을 *겁니다|않을게|않을게요))";
const KO_PLAIN_DENIAL = new RegExp(`^(?:(?:아니|아니요|아니야|아뇨)(?: |[,.!…。！]+ ?))?(?:(?:나는|난|나|저는|전|저|내가|제가) )?(?:자살|자해)(?:${KO_NOT_INTENDING}|${KO_PLAIN_REFUSAL})(?:[.!…。！]* ${KO_CORRECTION_TAIL})?[ .!…。！]*$`);
// English keeps its punctuation for this test: a mark inside the sentence is a break
// ("I'm not. Suicidal."), so only a "no" lead-in and closing marks may surround it. The lead-in
// ends with a space or with marks, with or without a space after them ("No,I'm not suicidal.").
const EN_STANDALONE_DENIAL = /^(?:no(?: |[,.!…。！]+ ?))?(?:(?:i am|i'm) not suicidal|i (?:do not|don't) want to die)[ .!…。！]*$/;

// Explicit everyday objects narrow an ambiguous "finish" occurrence. Keep
// object boundaries: "일생" (lifetime) must never be treated as "일" (work).
const WORK_OBJECT = "(?:일|업무|작업|공부|숙제|과제|프로젝트|보고서)";
// The finishing phrases the exception may mask, and only after a work object. The emphatic
// forms (끝내 버리고 싶 · 끝내 버릴 거) take the same condition as the plain ones (Q-261015-80):
// "과제를 빨리 끝내버리고 싶어" is a work statement, "다 끝내버리고 싶어" is not.
const FINISH = "끝(?:내고 *싶|낼 *거|내 *버리고 *싶|내 *버릴 *거)";
const WORK_BEFORE = `${WORK_OBJECT}(?:을|를)? *(?:(?:오늘|먼저|빨리|마저|다|좀|전부|모두) ){0,2}${FINISH}`;
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
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  if (RISK_CONTEXT.test(normalized)) return normalized;

  // A question about intent is not a denial. Only the known correction tail
  // may carry a question mark ("날 뭘로 보는거야?").
  const denial = normalized.replace(/[.,!…。！]/g, " ").replace(/\s+/g, " ").trim();
  // Phone keyboards type a curly apostrophe, which NFKC keeps; read it as the
  // straight one in this test copy only.
  const englishDenial = normalized.replace(/[‘’]/g, "'").trim();
  if (KO_STANDALONE_DENIAL.test(denial) || KO_PLAIN_DENIAL.test(normalized.trim()) || EN_STANDALONE_DENIAL.test(englishDenial)) {
    return normalized.replace(/자살|자해|suicidal|want to die/g, (term) => " ".repeat(term.length));
  }
  if (!KNOWN_WORK_CONTEXT.test(normalized.trim())) return normalized;

  // Mask just the contextual occurrence, so another crisis phrase elsewhere
  // still reaches the unchanged matcher. A benign first occurrence cannot
  // hide a later unqualified one.
  return normalized
    .replace(WORK_BEFORE_FINISH, (match) => match.replace(new RegExp(FINISH), (term: string) => " ".repeat(term.length)))
    .replace(WORK_AFTER_FINISH, (match) => match.replace(/끝내고 *싶/, (term: string) => " ".repeat(term.length)));
}

// The same test prepareCrisisScanText applies before any exception: does the
// text mention actions, means, preparation, or life-ending context? Exported so
// that another exception (model-reply-scan.ts) cannot relax what this test keeps
// strict. It deliberately favors false positives.
export function hasCrisisRiskContext(text: string): boolean {
  return RISK_CONTEXT.test(text.normalize("NFKC").toLowerCase().replace(/\s+/g, " "));
}

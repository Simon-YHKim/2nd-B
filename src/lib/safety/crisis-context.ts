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
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  if (RISK_CONTEXT.test(normalized)) return normalized;

  // A question about intent is not a denial. Only the known correction tail
  // may carry a question mark ("날 뭘로 보는거야?").
  const denial = normalized.replace(/[‘’]/g, "'").replace(/[.,!…。！]/g, " ").replace(/\s+/g, " ").trim();
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

// Loose scanning is additive. A rule must have an altered INTERNAL gap before
// it can return a hit: otherwise it would resurrect a literal denial that the
// unchanged context filter above deliberately masked. No scan text is exported.
// Each lexicon entry has an explicit decision; uncertainty keeps literal-only.
// Round 2 found ordinary code/path counterexamples for every remaining enabled
// term. All loose rules are dormant; never trade new ordinary false alarms for
// obfuscation coverage. Keep the dormant policy and address lexer tested.
export const CRISIS_SCAN_POLICY = {
  en: [
    { term: "suicide", loose: false, reason: "Ordinary code: const sui_cide = 1;" },
    { term: "suicidal", loose: false, reason: "Ordinary code: const sui_cidal = 1;" },
    { term: "kill myself", loose: false, reason: "Ordinary path /docs/kill/myself and separate clauses." },
    { term: "end my life", loose: false, reason: "Can join ordinary clauses: In the end, my life improved." },
    { term: "end it all", loose: false, reason: "Can mean finishing a task." },
    { term: "ending it", loose: false, reason: "Ordinary completion is common." },
    { term: "self-harm", loose: false, reason: "Ordinary code: const self_harm = 1;" },
    { term: "self harm", loose: false, reason: "Separate clauses: We study the self. Harm is a separate topic." },
    { term: "cutting myself", loose: false, reason: "Accidental cuts and ordinary activities need context." },
    { term: "want to die", loose: false, reason: "Ordinary code: const want_to_die = 1;" },
    { term: "i want to die", loose: false, reason: "Ordinary code: const i_want_to_die = 1;" },
    { term: "no reason to live", loose: false, reason: "Reason and live have ordinary contextual uses." },
    { term: "better off without me", loose: false, reason: "Leaving a team or relationship is ordinary." },
    { term: "burden to others", loose: false, reason: "Ordinary responsibility needs context." },
    { term: "fade away", loose: false, reason: "Sports, code and gradual fading are common." },
  ],
  ko: [
    { term: "자살", loose: false, reason: "Ordinary code: const 자_살 = 1; and non-ASCII URL paths." },
    { term: "죽고 싶", loose: false, reason: "Ordinary code: const 죽고_싶 = 1; and file paths." },
    { term: "죽고싶", loose: false, reason: "Ordinary code: const 죽_고싶 = 1; and identifier clauses." },
    { term: "살고 싶지 않", loose: false, reason: "Living somewhere is an ordinary alternative meaning." },
    { term: "사라지고 싶", loose: false, reason: "Figurative disappearance needs context." },
    { term: "더 이상 살", loose: false, reason: "살 also starts ordinary buying/living expressions." },
    { term: "끝내고 싶", loose: false, reason: "Ordinary work completion is common." },
    { term: "끝낼 거", loose: false, reason: "Ordinary work completion is common." },
    { term: "끝낼거", loose: false, reason: "Unspaced ordinary completion is common." },
    { term: "자해", loose: false, reason: "Ordinary code: const 자_해 = 1; and non-ASCII URL paths." },
    { term: "목숨을 끊", loose: false, reason: "Opposite meaning: 고양이 목숨을, 끊어진 전선에서 구했어." },
    { term: "스스로 목숨", loose: false, reason: "Can describe saving one's own life." },
    { term: "유서", loose: false, reason: "Names and 유서 깊은 are ordinary uses." },
    { term: "마지막 인사", loose: false, reason: "Ordinary farewells are common." },
    { term: "짐이 되", loose: false, reason: "Ordinary luggage and responsibility need context." },
    { term: "없어지는 게 나아", loose: false, reason: "May refer to an ordinary object." },
    { term: "사라지는 게 나", loose: false, reason: "May refer to an ordinary object." },
    { term: "다음 생에는", loose: false, reason: "Figurative and fictional uses need context." },
    { term: "영영 잠들고 싶", loose: false, reason: "Metaphorical sleep needs context." },
  ],
} as const;

type ScanLocale = keyof typeof CRISIS_SCAN_POLICY;
// 0 = all remaining code points (seams), 1 = letters/numbers, 2 = whitespace.
function characterKind(cp: number): number {
  if ((cp >= 0x09 && cp <= 0x0d) || cp === 0x20 || cp === 0x85 ||
      cp === 0xa0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200a) ||
      cp === 0x2028 || cp === 0x2029 || cp === 0x202f || cp === 0x205f || cp === 0x3000) return 2;
  if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) ||
      (cp >= 0xa960 && cp <= 0xa97f) || (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xd7b0 && cp <= 0xd7ff) || (cp >= 0xffa0 && cp <= 0xffdc)) return 1;
  let low = 0;
  let high = LETTER_NUMBER_RANGES.length / 2;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cp < LETTER_NUMBER_RANGES[mid * 2]) high = mid;
    else if (cp > LETTER_NUMBER_RANGES[mid * 2 + 1]) low = mid + 1;
    else return 1;
  }
  return 0;
}

// Positive character classes only. Generated from Unicode 17.0 (Node ICU):
// Script=Latin intersect Letter, union Number. These are classifier ranges,
// not a list of seams: every other non-whitespace code point is a seam.
// runtime uses code-point ranges, never Unicode-property regular expressions.
const LETTER_NUMBER_RANGES: readonly number[] = [
  0x30, 0x39, 0x41, 0x5a, 0x61, 0x7a, 0xaa, 0xaa,
  0xb2, 0xb3, 0xb9, 0xba, 0xbc, 0xbe, 0xc0, 0xd6,
  0xd8, 0xf6, 0xf8, 0x2b8, 0x2e0, 0x2e4, 0x660, 0x669,
  0x6f0, 0x6f9, 0x7c0, 0x7c9, 0x966, 0x96f, 0x9e6, 0x9ef,
  0x9f4, 0x9f9, 0xa66, 0xa6f, 0xae6, 0xaef, 0xb66, 0xb6f,
  0xb72, 0xb77, 0xbe6, 0xbf2, 0xc66, 0xc6f, 0xc78, 0xc7e,
  0xce6, 0xcef, 0xd58, 0xd5e, 0xd66, 0xd78, 0xde6, 0xdef,
  0xe50, 0xe59, 0xed0, 0xed9, 0xf20, 0xf33, 0x1040, 0x1049,
  0x1090, 0x1099, 0x1369, 0x137c, 0x16ee, 0x16f0, 0x17e0, 0x17e9,
  0x17f0, 0x17f9, 0x1810, 0x1819, 0x1946, 0x194f, 0x19d0, 0x19da,
  0x1a80, 0x1a89, 0x1a90, 0x1a99, 0x1b50, 0x1b59, 0x1bb0, 0x1bb9,
  0x1c40, 0x1c49, 0x1c50, 0x1c59, 0x1d00, 0x1d25, 0x1d2c, 0x1d5c,
  0x1d62, 0x1d65, 0x1d6b, 0x1d77, 0x1d79, 0x1dbe, 0x1e00, 0x1eff,
  0x2070, 0x2071, 0x2074, 0x2079, 0x207f, 0x2089, 0x2090, 0x209c,
  0x212a, 0x212b, 0x2132, 0x2132, 0x214e, 0x214e, 0x2150, 0x2189,
  0x2460, 0x249b, 0x24ea, 0x24ff, 0x2776, 0x2793, 0x2c60, 0x2c7f,
  0x2cfd, 0x2cfd, 0x3007, 0x3007, 0x3021, 0x3029, 0x3038, 0x303a,
  0x3192, 0x3195, 0x3220, 0x3229, 0x3248, 0x324f, 0x3251, 0x325f,
  0x3280, 0x3289, 0x32b1, 0x32bf, 0xa620, 0xa629, 0xa6e6, 0xa6ef,
  0xa722, 0xa787, 0xa78b, 0xa7dc, 0xa7f1, 0xa7ff, 0xa830, 0xa835,
  0xa8d0, 0xa8d9, 0xa900, 0xa909, 0xa9d0, 0xa9d9, 0xa9f0, 0xa9f9,
  0xaa50, 0xaa59, 0xab30, 0xab5a, 0xab5c, 0xab64, 0xab66, 0xab69,
  0xabf0, 0xabf9, 0xfb00, 0xfb06, 0xff10, 0xff19, 0xff21, 0xff3a,
  0xff41, 0xff5a, 0x10107, 0x10133, 0x10140, 0x10178, 0x1018a, 0x1018b,
  0x102e1, 0x102fb, 0x10320, 0x10323, 0x10341, 0x10341, 0x1034a, 0x1034a,
  0x103d1, 0x103d5, 0x104a0, 0x104a9, 0x10780, 0x10785, 0x10787, 0x107b0,
  0x107b2, 0x107ba, 0x10858, 0x1085f, 0x10879, 0x1087f, 0x108a7, 0x108af,
  0x108fb, 0x108ff, 0x10916, 0x1091b, 0x109bc, 0x109bd, 0x109c0, 0x109cf,
  0x109d2, 0x109ff, 0x10a40, 0x10a48, 0x10a7d, 0x10a7e, 0x10a9d, 0x10a9f,
  0x10aeb, 0x10aef, 0x10b58, 0x10b5f, 0x10b78, 0x10b7f, 0x10ba9, 0x10baf,
  0x10cfa, 0x10cff, 0x10d30, 0x10d39, 0x10d40, 0x10d49, 0x10e60, 0x10e7e,
  0x10f1d, 0x10f26, 0x10f51, 0x10f54, 0x10fc5, 0x10fcb, 0x11052, 0x1106f,
  0x110f0, 0x110f9, 0x11136, 0x1113f, 0x111d0, 0x111d9, 0x111e1, 0x111f4,
  0x112f0, 0x112f9, 0x11450, 0x11459, 0x114d0, 0x114d9, 0x11650, 0x11659,
  0x116c0, 0x116c9, 0x116d0, 0x116e3, 0x11730, 0x1173b, 0x118e0, 0x118f2,
  0x11950, 0x11959, 0x11bf0, 0x11bf9, 0x11c50, 0x11c6c, 0x11d50, 0x11d59,
  0x11da0, 0x11da9, 0x11de0, 0x11de9, 0x11f50, 0x11f59, 0x11fc0, 0x11fd4,
  0x12400, 0x1246e, 0x16130, 0x16139, 0x16a60, 0x16a69, 0x16ac0, 0x16ac9,
  0x16b50, 0x16b59, 0x16b5b, 0x16b61, 0x16d70, 0x16d79, 0x16e80, 0x16e96,
  0x16ff4, 0x16ff6, 0x1ccf0, 0x1ccf9, 0x1d2c0, 0x1d2d3, 0x1d2e0, 0x1d2f3,
  0x1d360, 0x1d378, 0x1d7ce, 0x1d7ff, 0x1df00, 0x1df1e, 0x1df25, 0x1df2a,
  0x1e140, 0x1e149, 0x1e2f0, 0x1e2f9, 0x1e4f0, 0x1e4f9, 0x1e5f1, 0x1e5fa,
  0x1e8c7, 0x1e8cf, 0x1e950, 0x1e959, 0x1ec71, 0x1ecab, 0x1ecad, 0x1ecaf,
  0x1ecb1, 0x1ecb4, 0x1ed01, 0x1ed2d, 0x1ed2f, 0x1ed3d, 0x1f100, 0x1f10c,
  0x1fbf0, 0x1fbf9,
];

function asciiAlnum(cp: number): boolean {
  return (cp >= 97 && cp <= 122) || (cp >= 48 && cp <= 57);
}

function addressHead(cp: number): boolean {
  return asciiAlnum(cp) || cp === 46 || cp === 45 || cp === 95 || cp === 37 || cp === 43;
}

// A small address lexer, not a whitespace-token exemption. Only affirmative
// email / scheme / dotted-host-with-path syntax is excluded. Bare dotted words
// (I.want.to.die) are not URLs. Commas, brackets, quotes and non-ASCII punctuation
// terminate addresses so neighbouring prose remains visible. Ambiguous URL
// path text stays part of the address, favouring no new ordinary false alarms.
function excludeAddresses(text: string, kinds: Uint8Array): void {
  for (let i = 0; i < text.length;) {
    if (!addressHead(text.charCodeAt(i))) { i++; continue; }
    const start = i;
    let dots = 0;
    let host = true;
    while (i < text.length && addressHead(text.charCodeAt(i))) {
      if (text[i] === ".") dots++;
      if (text[i] === "_" || text[i] === "%" || text[i] === "+") host = false;
      i++;
    }
    const headEnd = i;
    const scheme = text.slice(start, i);
    const hasScheme = (scheme === "https" || scheme === "http" || scheme === "ftp") && text.startsWith("://", i);
    const email = text[i] === "@";
    if (email || hasScheme) {
      i += email ? 1 : 3;
      const domainStart = i;
      while (i < text.length && (asciiAlnum(text.charCodeAt(i)) || text[i] === "." || text[i] === "-")) i++;
      if (i === domainStart) continue;
    } else {
      if (!(host && dots > 0)) continue;
      // SL-02: confirm host[:digits]/path before treating it as an address.
      // Failed candidates still advance monotonically through the numeric run.
      if (text[i] === ":") {
        i++;
        const portStart = i;
        while (text.charCodeAt(i) >= 48 && text.charCodeAt(i) <= 57) i++;
        if (i === portStart) continue;
      }
      if (text[i] !== "/") continue;
    }
    if (!email) {
      // A numeric port, then a path/query/fragment. Every consumed run advances
      // i even on failure; no candidate restarts inside a previously read run.
      if (text[i] === ":") {
        i++;
        while (text.charCodeAt(i) >= 48 && text.charCodeAt(i) <= 57) i++;
      }
      if (text[i] === "/" || text[i] === "?" || text[i] === "#") {
        while (i < text.length) {
          const cp = text.charCodeAt(i);
          if (!(addressHead(cp) || cp === 47 || cp === 58 || cp === 63 || cp === 35 || cp === 61 || cp === 38 || cp === 126)) break;
          i++;
        }
      }
    }
    let end = i;
    while (end > headEnd && (text[end - 1] === "." || text[end - 1] === ":" || text[end - 1] === "?")) end--;
    // 3 is a hard barrier: a matcher cannot join words across an address.
    kinds.fill(3, start, end);
  }
}

interface ScanRule {
  locale: ScanLocale;
  terms: string[];
  letters: string;
  wordStarts: number[];
  single: boolean;
  deathWish: boolean;
}

const SCAN_RULES: ScanRule[] = [];
for (const locale of ["en", "ko"] as const) {
  for (const policy of CRISIS_SCAN_POLICY[locale]) {
    if (!policy.loose) continue;
    const phrase = policy.term === "self-harm" ? "self harm" : policy.term;
    const words = phrase.split(" ");
    const wordStarts: number[] = [];
    let length = 0;
    for (const word of words) { if (length) wordStarts.push(length); length += word.length; }
    const rule = { locale, terms: [policy.term], letters: words.join(""), wordStarts,
      single: words.length === 1, deathWish: phrase === "죽고 싶" || phrase === "죽고싶" };
    // Deduplicate the two self-harm spellings regardless of policy row order.
    const alias = SCAN_RULES.find((r) => r.locale === locale && r.letters === rule.letters && r.wordStarts.join() === wordStarts.join());
    if (alias) alias.terms.push(policy.term);
    else SCAN_RULES.push(rule);
  }
}

/** O(n * S), S = fixed total lexicon prefix states, independent of input length.
 * Classify code points once, mark address spans once, then advance fixed states
 * forward. No suffix searches, gap backtracking, or per-hit span searches.
 * Only matched vocabulary leaves this function; model/storage/audit keep raw text.
 */
export function scanCrisisObfuscation(text: string): Record<ScanLocale, ReadonlySet<string>> {
  const normalized = text.normalize("NFKC").toLowerCase();
  const kinds = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length;) {
    const cp = normalized.codePointAt(i)!;
    kinds[i] = characterKind(cp);
    if (cp > 0xffff) kinds[i + 1] = kinds[i];
    i += cp > 0xffff ? 2 : 1;
  }
  excludeAddresses(normalized, kinds);
  const result = { en: new Set<string>(), ko: new Set<string>() };
  const clean = new Int32Array(SCAN_RULES.length);
  const altered = new Int32Array(SCAN_RULES.length);
  const pending = new Uint8Array(SCAN_RULES.length);
  let space = true;
  let seam = false;
  let barrier = false;
  let chunkStart = true;
  for (let i = 0; i <= normalized.length;) {
    const end = i === normalized.length;
    const kind = end ? 1 : kinds[i];
    const cp = end ? 0 : normalized.codePointAt(i)!;
    const ch = end ? "" : String.fromCodePoint(cp);
    i += cp > 0xffff ? 2 : 1;
    if (kind !== 1) {
      if (kind === 2 || kind === 3) { space = true; chunkStart = true; }
      if (kind === 3) barrier = true;
      if (kind === 0) seam = true;
      continue;
    }
    for (let r = 0; r < SCAN_RULES.length; r++) {
      const rule = SCAN_RULES[r];
      // EN ends at a chunk/address boundary, never inside a reconstructed word.
      // KO nouns also admit a narrow grammatical continuation, not 살펴/해바라기.
      const ending = end || space || (rule.locale === "ko" &&
        (!rule.single || rule.deathWish || "하할했해을를이은에로과도의만".includes(ch)));
      if (pending[r] && ending) for (const term of rule.terms) result[rule.locale].add(term);
      pending[r] = 0;
      let nextClean = 0;
      let nextAltered = 0;
      for (let p = 0; p < rule.letters.length; p++) {
        if (rule.letters[p] !== ch) continue;
        const bit = 1 << p;
        if (p === 0) {
          if (chunkStart || (!rule.single && seam)) nextClean |= 1 << 1;
          continue;
        }
        if (barrier || !((clean[r] | altered[r]) & bit)) continue;
        const wordGap = rule.wordStarts.includes(p);
        // Deliberate exception for 죽 고 싶; never permit arbitrary KO syllable spaces.
        const splitWish = rule.deathWish && (p === 1 || p === 2);
        if (wordGap ? !(space || seam) : (space && !splitWish)) continue;
        const changed = seam || (space && !wordGap);
        if (p + 1 === rule.letters.length) {
          if (changed || (altered[r] & bit)) pending[r] = 1;
        } else {
          if (!changed && (clean[r] & bit)) nextClean |= 1 << (p + 1);
          if (changed || (altered[r] & bit)) nextAltered |= 1 << (p + 1);
        }
      }
      clean[r] = nextClean;
      altered[r] = nextAltered;
    }
    space = false;
    seam = false;
    barrier = false;
    chunkStart = false;
  }
  return result;
}

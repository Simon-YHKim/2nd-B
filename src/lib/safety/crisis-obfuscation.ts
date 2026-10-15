// App-only request gate, never a crisis verdict. Q-261011-05 (2026-10-11).
// Scanner copied without algorithm changes from dd8c86ca crisis-context.ts.
// Only the policy changes: 29 terms ask for meaning, five completion terms stay off.
// Literal terms belong to the existing classifier. Do not import this from Edge.

export const CRISIS_SCAN_POLICY = {
  en: [
    { term: "suicide", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "suicidal", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "kill myself", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "end my life", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "end it all", loose: false, reason: "Keep out of this gate: ordinary task completion is common." },
    { term: "ending it", loose: false, reason: "Keep out of this gate: ordinary task completion is common." },
    { term: "self-harm", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "self harm", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "cutting myself", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "want to die", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "i want to die", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "no reason to live", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "better off without me", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "burden to others", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "fade away", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
  ],
  ko: [
    { term: "자살", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "죽고 싶", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "죽고싶", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "살고 싶지 않", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "사라지고 싶", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "더 이상 살", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "끝내고 싶", loose: false, reason: "Keep out of this gate: ordinary task completion is common." },
    { term: "끝낼 거", loose: false, reason: "Keep out of this gate: ordinary task completion is common." },
    { term: "끝낼거", loose: false, reason: "Keep out of this gate: ordinary task completion is common." },
    { term: "자해", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "목숨을 끊", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "스스로 목숨", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "유서", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "마지막 인사", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "짐이 되", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "없어지는 게 나아", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "사라지는 게 나", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "다음 생에는", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
    { term: "영영 잠들고 싶", loose: true, reason: "Ask for meaning only when this term has an altered internal gap." },
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
function scanCrisisObfuscation(text: string): Record<ScanLocale, ReadonlySet<string>> {
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

/** Whether an altered internal gap warrants one semantic input check. */
export function hasCrisisObfuscation(text: string): boolean {
  const matches = scanCrisisObfuscation(text);
  return matches.en.size > 0 || matches.ko.size > 0;
}

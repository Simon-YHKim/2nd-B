// Capture-time domain detection (constellation layer A, PRD §4.2). Given a
// capture's text, pick which of the seven DOMAIN stars it belongs to so the
// record can be tagged `domain:<slug>` at insert — the slug is what
// load-domain-levels groups on to light the home constellation.
//
// Pure + deterministic + LLM-free, exactly like src/lib/import/detect.ts: this
// is the INSTRUMENT layer, and the brightness-honesty rule forbids an LLM from
// deciding coverage. A bilingual (KO + EN) keyword vote picks the best-scoring
// domain; ties break by Big-Dipper order (career first). When nothing matches we
// fall to "collect" — the canonical catch-all (담아내기), never a wrong guess.

import { DOMAIN_STARS, domainTagFor, isDomainTag, type DomainId } from "../persona/domain-stars";

// Keyword votes per domain. Lowercased substring match (Korean has no word
// boundaries, so substring is the norm; English keywords are chosen to be
// distinctive enough that substring collisions are rare). "collect" has no
// keywords — it is the default, not something we detect FOR. Vocabulary stays
// lifestyle/neutral: no clinical terms (lexicon.ts forbids them, and this is not
// a medical app), so the "health" star reads exercise/sleep/diet, not pathology.
const DOMAIN_KEYWORDS: Record<Exclude<DomainId, "collect">, readonly string[]> = {
  career: [
    "career", "job", "work", "interview", "meeting", "promotion", "deadline",
    "resume", "colleague", "manager", "client", "startup", "office",
    "커리어", "이직", "회사", "업무", "출근", "퇴근", "면접", "직장", "승진",
    "회의", "동료", "상사", "프로젝트", "야근", "연봉협상",
  ],
  finance: [
    "money", "budget", "salary", "spending", "invest", "stock", "savings",
    "expense", "rent", "loan", "tax", "income", "wallet",
    "돈", "월급", "지출", "투자", "주식", "저축", "예산", "대출", "가계부",
    "재정", "소비", "적금", "세금", "수입", "잔고", "용돈",
  ],
  growth: [
    "learn", "study", "book", "reading", "course", "skill", "practice",
    "language", "habit", "goal", "lecture", "tutorial",
    "공부", "학습", "독서", "강의", "성장", "습관", "목표", "연습", "배우",
    "자격증", "스터디", "복습", "외국어",
  ],
  relation: [
    "friend", "family", "partner", "relationship", "parents", "date", "spouse",
    "girlfriend", "boyfriend", "wedding", "breakup",
    "친구", "가족", "연인", "관계", "부모", "데이트", "사랑", "만남", "결혼",
    "이별", "남편", "아내", "여자친구", "남자친구", "지인",
  ],
  health: [
    "exercise", "workout", "gym", "running", "sleep", "diet", "weight", "walk",
    "hospital", "steps", "stretch", "yoga", "nutrition",
    "운동", "헬스", "수면", "식단", "다이어트", "체중", "걷기", "병원", "산책",
    "스트레칭", "요가", "러닝", "영양", "스쿼트",
  ],
  recreation: [
    "game", "movie", "music", "hobby", "travel", "trip", "concert", "drama",
    "play", "festival", "album", "show",
    "게임", "영화", "음악", "취미", "여행", "공연", "드라마", "맛집", "축제",
    "앨범", "전시", "놀러", "넷플릭스",
  ],
};

// Big-Dipper order (career → … → recreation); used as the deterministic
// tie-break when two domains score equally. "collect" is excluded — it is the
// fallback, never a tie winner.
const TIE_ORDER = DOMAIN_STARS.filter((d) => d.id !== "collect").map(
  (d) => d.id,
) as Exclude<DomainId, "collect">[];

// Split each domain's keywords into Korean (substring match — Korean has no word
// boundaries, so substring is correct) and English/ASCII (word-boundary match).
// Word boundaries fix false positives the old substring scan produced: "work"
// (career) no longer fires on "framework"/"network"/"homework"/"workout", "date"
// (relation) no longer on "update"/"candidate", "play" not on "display", "show"
// not on "shower". Precompiled once at module load; detectDomain stays pure.
const isAscii = (s: string): boolean => {
  for (let i = 0; i < s.length; i += 1) if (s.charCodeAt(i) > 127) return false;
  return true;
};
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface DomainMatcher {
  id: Exclude<DomainId, "collect">;
  korean: readonly string[];
  englishRes: readonly RegExp[];
}

const DOMAIN_MATCHERS: readonly DomainMatcher[] = TIE_ORDER.map((id) => {
  const kws = DOMAIN_KEYWORDS[id];
  return {
    id,
    korean: kws.filter((k) => !isAscii(k)),
    // Non-global so .test() is stateless; haystack is pre-lowercased but keep `i`.
    englishRes: kws.filter(isAscii).map((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`, "i")),
  };
});

/**
 * Best-effort domain for a capture. Pure: scores each domain by distinct
 * keyword hits in the combined text (Korean substring + English word-boundary),
 * returns the highest (ties broken by Big-Dipper order). No match → "collect"
 * (the catch-all). Never throws.
 */
export function detectDomain(text: string): DomainId {
  const haystack = (text ?? "").toLowerCase();
  if (haystack.trim().length === 0) return "collect";

  let best: DomainId = "collect";
  let bestScore = 0;
  for (const m of DOMAIN_MATCHERS) {
    let score = 0;
    for (const kw of m.korean) if (haystack.includes(kw)) score += 1;
    for (const re of m.englishRes) if (re.test(haystack)) score += 1;
    // Strict > keeps the earlier (higher-priority) domain on a tie.
    if (score > bestScore) {
      bestScore = score;
      best = m.id;
    }
  }
  return best;
}

/** The canonical tag string for a domain (re-exported from the domain model so
 *  the detector + capture path share one definition with every tag consumer). */
export const domainTag = domainTagFor;

/**
 * Merge the detected domain tag into a record's tags, dropping any caller- or
 * user-supplied `domain:*` tag first so the instrument owns the domain slug (no
 * hijack, exactly one domain tag per record). Order: domain tag first, then the
 * remaining user tags unchanged.
 */
export function withDomainTag(tags: readonly string[] | undefined, text: string): string[] {
  const userTags = (tags ?? []).filter((t) => !isDomainTag(t));
  return [domainTagFor(detectDomain(text)), ...userTags];
}

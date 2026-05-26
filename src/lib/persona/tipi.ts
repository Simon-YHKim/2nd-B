// TIPI — Ten-Item Personality Inventory (Gosling, Rentfrow & Swann, 2003).
// Validated 10-item Big Five measure. Each trait gets two items: one
// positive-keyed, one negative-keyed (reverse-scored).
//
// Scale: 1 (Disagree strongly) … 7 (Agree strongly).
// Trait score: mean of the two items after reverse-coding the negative one.
//
// Reference: Gosling, S. D., Rentfrow, P. J., & Swann, W. B., Jr. (2003).
//   A Very Brief Measure of the Big-Five Personality Domains.
//   Journal of Research in Personality, 37, 504-528.

export type BigFiveTrait =
  | "extraversion"
  | "agreeableness"
  | "conscientiousness"
  | "emotional_stability"
  | "openness";

export interface TipiItem {
  /** 1-based item number in the original TIPI. */
  id: number;
  /** Trait this item loads on. */
  trait: BigFiveTrait;
  /** True if the item is reverse-scored (negative-keyed). */
  reverse: boolean;
  /** Item stem in EN. */
  en: string;
  /** Item stem in KO. */
  ko: string;
}

export const TIPI_ITEMS: readonly TipiItem[] = [
  { id: 1, trait: "extraversion", reverse: false, en: "Extraverted, enthusiastic.", ko: "외향적이고 열정적이다." },
  { id: 2, trait: "agreeableness", reverse: true, en: "Critical, quarrelsome.", ko: "비판적이고 다투기 좋아한다." },
  { id: 3, trait: "conscientiousness", reverse: false, en: "Dependable, self-disciplined.", ko: "믿음직하고 자기 통제가 잘된다." },
  { id: 4, trait: "emotional_stability", reverse: true, en: "Anxious, easily upset.", ko: "불안하고 쉽게 동요된다." },
  { id: 5, trait: "openness", reverse: false, en: "Open to new experiences, complex.", ko: "새로운 경험에 열려 있고 다층적이다." },
  { id: 6, trait: "extraversion", reverse: true, en: "Reserved, quiet.", ko: "내성적이고 조용하다." },
  { id: 7, trait: "agreeableness", reverse: false, en: "Sympathetic, warm.", ko: "공감 잘하고 따뜻하다." },
  { id: 8, trait: "conscientiousness", reverse: true, en: "Disorganized, careless.", ko: "정리가 안 되고 부주의하다." },
  { id: 9, trait: "emotional_stability", reverse: false, en: "Calm, emotionally stable.", ko: "차분하고 정서적으로 안정되어 있다." },
  { id: 10, trait: "openness", reverse: true, en: "Conventional, uncreative.", ko: "관습적이고 창의성이 부족하다." },
] as const;

export type TipiResponses = Partial<Record<number, number>>;

export interface TipiScore {
  trait: BigFiveTrait;
  /** Mean of the two items, on the 1-7 scale. */
  score: number;
}

export interface TipiResult {
  scores: TipiScore[];
  /** Same data keyed by trait, easier for the UI to look up. */
  byTrait: Record<BigFiveTrait, number>;
  /** Number of items answered (0..10). */
  answered: number;
  /** True when all 10 items have a response in [1..7]. */
  complete: boolean;
}

function reverseScore(value: number): number {
  return 8 - value;
}

export function scoreTipi(responses: TipiResponses): TipiResult {
  const traitSums: Record<BigFiveTrait, { sum: number; count: number }> = {
    extraversion: { sum: 0, count: 0 },
    agreeableness: { sum: 0, count: 0 },
    conscientiousness: { sum: 0, count: 0 },
    emotional_stability: { sum: 0, count: 0 },
    openness: { sum: 0, count: 0 },
  };

  let answered = 0;
  for (const item of TIPI_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 7 || !Number.isFinite(raw)) continue;
    answered += 1;
    const value = item.reverse ? reverseScore(raw) : raw;
    traitSums[item.trait].sum += value;
    traitSums[item.trait].count += 1;
  }

  const scores: TipiScore[] = [];
  const byTrait: Record<BigFiveTrait, number> = {
    extraversion: 0,
    agreeableness: 0,
    conscientiousness: 0,
    emotional_stability: 0,
    openness: 0,
  };
  for (const trait of Object.keys(traitSums) as BigFiveTrait[]) {
    const { sum, count } = traitSums[trait];
    const mean = count > 0 ? sum / count : 0;
    scores.push({ trait, score: mean });
    byTrait[trait] = mean;
  }

  return { scores, byTrait, answered, complete: answered === TIPI_ITEMS.length };
}

export const TRAIT_LABEL_EN: Record<BigFiveTrait, string> = {
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  conscientiousness: "Conscientiousness",
  emotional_stability: "Emotional Stability",
  openness: "Openness to Experience",
};

export const TRAIT_LABEL_KO: Record<BigFiveTrait, string> = {
  extraversion: "외향성",
  agreeableness: "친화성",
  conscientiousness: "성실성",
  emotional_stability: "정서적 안정성",
  openness: "경험 개방성",
};

// BFI-44 — Big Five Inventory (John, Donahue, & Kentle, 1991).
// 44 items, 5-point Likert scale. Public domain. Replaces TIPI as the
// primary Big Five measure because TIPI's 10-item brevity costs precision
// at each trait (only 2 items per trait → low internal consistency).
//
// Scale: 1 (Disagree strongly) … 5 (Agree strongly).
// Trait score: mean of trait items after reverse-coding.
//
// `subtitle` is a one-line friendly paraphrase shown in the UI under the
// stem. The stem itself stays exactly as published so scores remain
// validated; the subtitle adds context without changing what's measured.
//
// Reference: John, O. P., Donahue, E. M., & Kentle, R. L. (1991).
//   The Big Five Inventory — Versions 4a and 54. Berkeley, CA:
//   University of California, Berkeley, Institute of Personality and
//   Social Research.

export type BigFiveTrait =
  | "extraversion"
  | "agreeableness"
  | "conscientiousness"
  | "neuroticism"
  | "openness";

export interface BfiItem {
  /** 1-based item number in the original BFI-44. */
  id: number;
  /** Trait this item loads on. */
  trait: BigFiveTrait;
  /** True if the item is reverse-scored (negative-keyed). */
  reverse: boolean;
  /** Item stem in EN (verbatim from BFI-44 to preserve validity). */
  en: string;
  /** Item stem in KO. */
  ko: string;
  /** Friendly one-line context under the stem. Does not affect scoring. */
  subtitleEn: string;
  subtitleKo: string;
}

// All 44 items begin with "I see myself as someone who…" — that framing
// is presented once at the top of the screen, not repeated per item.
export const BFI_ITEMS: readonly BfiItem[] = [
  { id: 1, trait: "extraversion", reverse: false, en: "Is talkative.", ko: "말이 많은 편이다.", subtitleEn: "Comfortable filling silence in conversation.", subtitleKo: "대화에서 침묵을 채우는 게 편한 편." },
  { id: 2, trait: "agreeableness", reverse: true, en: "Tends to find fault with others.", ko: "다른 사람의 결점을 잘 찾는 편이다.", subtitleEn: "Notices what's wrong before what's right.", subtitleKo: "잘된 점보다 잘못된 점이 먼저 보인다." },
  { id: 3, trait: "conscientiousness", reverse: false, en: "Does a thorough job.", ko: "일을 꼼꼼하게 하는 편이다.", subtitleEn: "Sees a task through to the details, not just done.", subtitleKo: "끝냈다 보다 디테일까지 챙기는 쪽." },
  { id: 4, trait: "neuroticism", reverse: false, en: "Is depressed, blue.", ko: "우울하거나 침울할 때가 많다.", subtitleEn: "Heavy mood lingers more often than not.", subtitleKo: "가라앉은 기분이 머무는 시간이 길다." },
  { id: 5, trait: "openness", reverse: false, en: "Is original, comes up with new ideas.", ko: "독창적이고 새로운 아이디어를 잘 떠올린다.", subtitleEn: "Pulls fresh angles others didn't see.", subtitleKo: "남들이 못 본 새 각도가 자주 떠오른다." },
  { id: 6, trait: "extraversion", reverse: true, en: "Is reserved.", ko: "내성적이고 조심스러운 편이다.", subtitleEn: "Holds back rather than opens up first.", subtitleKo: "먼저 다가가기보다 한 발 물러서는 쪽." },
  { id: 7, trait: "agreeableness", reverse: false, en: "Is helpful and unselfish with others.", ko: "남에게 도움이 되고 이타적인 편이다.", subtitleEn: "Defaults to giving rather than keeping.", subtitleKo: "쥐고 있기보다 나누는 쪽이 기본." },
  { id: 8, trait: "conscientiousness", reverse: true, en: "Can be somewhat careless.", ko: "조금 부주의한 편이다.", subtitleEn: "Sometimes ships before double-checking.", subtitleKo: "한 번 더 확인 안 하고 그냥 보내는 일이 있다." },
  { id: 9, trait: "neuroticism", reverse: true, en: "Is relaxed, handles stress well.", ko: "여유롭고 스트레스를 잘 다룬다.", subtitleEn: "Pressure doesn't tighten you up much.", subtitleKo: "압박이 와도 크게 굳지 않는다." },
  { id: 10, trait: "openness", reverse: false, en: "Is curious about many different things.", ko: "다양한 주제에 호기심이 많다.", subtitleEn: "Falls into rabbit holes across topics.", subtitleKo: "주제 가리지 않고 깊이 들어가는 편." },
  { id: 11, trait: "extraversion", reverse: false, en: "Is full of energy.", ko: "에너지가 넘치는 편이다.", subtitleEn: "Reserves rarely run low during the day.", subtitleKo: "하루 중 에너지가 잘 안 떨어진다." },
  { id: 12, trait: "agreeableness", reverse: true, en: "Starts quarrels with others.", ko: "남들과 다툼을 일으키는 편이다.", subtitleEn: "Will pick a fight when something's wrong.", subtitleKo: "잘못된 게 보이면 충돌도 마다 않는다." },
  { id: 13, trait: "conscientiousness", reverse: false, en: "Is a reliable worker.", ko: "믿고 맡길 수 있는 사람이다.", subtitleEn: "What you promise, you deliver.", subtitleKo: "약속한 건 결과로 가져오는 사람." },
  { id: 14, trait: "neuroticism", reverse: false, en: "Can be tense.", ko: "긴장할 때가 많다.", subtitleEn: "Body holds onto the alert signal a while.", subtitleKo: "몸에서 경계 신호가 잘 안 풀린다." },
  { id: 15, trait: "openness", reverse: false, en: "Is ingenious, a deep thinker.", ko: "독창적이고 깊이 생각하는 편이다.", subtitleEn: "Goes a layer deeper than the surface question.", subtitleKo: "표면 질문보다 한 층 더 들어간다." },
  { id: 16, trait: "extraversion", reverse: false, en: "Generates a lot of enthusiasm.", ko: "주위에 활기를 잘 일으킨다.", subtitleEn: "Lights up the room when you're into it.", subtitleKo: "꽂힐 때 방 분위기가 같이 올라간다." },
  { id: 17, trait: "agreeableness", reverse: false, en: "Has a forgiving nature.", ko: "남을 잘 용서하는 편이다.", subtitleEn: "Lets old grievances actually drop.", subtitleKo: "지난 서운함을 실제로 내려놓는 편." },
  { id: 18, trait: "conscientiousness", reverse: true, en: "Tends to be disorganized.", ko: "정리가 잘 안 되는 편이다.", subtitleEn: "Your desk reflects the inside of your head.", subtitleKo: "책상 상태가 머릿속 상태와 닮아 있다." },
  { id: 19, trait: "neuroticism", reverse: false, en: "Worries a lot.", ko: "걱정이 많은 편이다.", subtitleEn: "What-ifs keep cycling even when nothing's wrong.", subtitleKo: "별일 없을 때도 만약을 자주 굴린다." },
  { id: 20, trait: "openness", reverse: false, en: "Has an active imagination.", ko: "상상력이 풍부하다.", subtitleEn: "Scenarios play out vividly in your head.", subtitleKo: "머릿속 장면이 선명하게 굴러간다." },
  { id: 21, trait: "extraversion", reverse: true, en: "Tends to be quiet.", ko: "조용한 편이다.", subtitleEn: "Speaks when there's a reason, not to fill space.", subtitleKo: "이유가 있을 때 말하지, 빈 자리 채우려는 편은 아니다." },
  { id: 22, trait: "agreeableness", reverse: false, en: "Is generally trusting.", ko: "사람을 대체로 잘 믿는 편이다.", subtitleEn: "Assumes good faith until shown otherwise.", subtitleKo: "반대 증거가 나오기 전까지는 선의를 가정한다." },
  { id: 23, trait: "conscientiousness", reverse: true, en: "Tends to be lazy.", ko: "게으른 편이다.", subtitleEn: "Effort budget runs out before the task list.", subtitleKo: "할 일 목록보다 의지 예산이 먼저 바닥난다." },
  { id: 24, trait: "neuroticism", reverse: true, en: "Is emotionally stable, not easily upset.", ko: "정서적으로 안정되어 있고 잘 흔들리지 않는다.", subtitleEn: "Bad news lands without capsizing the day.", subtitleKo: "안 좋은 소식이 와도 하루가 뒤집히진 않는다." },
  { id: 25, trait: "openness", reverse: false, en: "Is inventive.", ko: "발명적이고 창의적인 편이다.", subtitleEn: "Builds workarounds when the standard tool fails.", subtitleKo: "기존 도구가 안 통하면 우회로를 잘 만든다." },
  { id: 26, trait: "extraversion", reverse: false, en: "Has an assertive personality.", ko: "자기주장이 분명한 편이다.", subtitleEn: "Takes the lead when the room is unsure.", subtitleKo: "분위기가 애매할 때 먼저 나서는 편." },
  { id: 27, trait: "agreeableness", reverse: true, en: "Can be cold and aloof.", ko: "차갑고 거리감을 두는 편일 때가 있다.", subtitleEn: "Warmth doesn't come on by default.", subtitleKo: "온도가 기본값으로 따뜻하진 않다." },
  { id: 28, trait: "conscientiousness", reverse: false, en: "Perseveres until the task is finished.", ko: "끝낼 때까지 끈기 있게 해낸다.", subtitleEn: "Doesn't drop the rope when it gets boring.", subtitleKo: "지루해진다고 줄을 놓진 않는다." },
  { id: 29, trait: "neuroticism", reverse: false, en: "Can be moody.", ko: "기분 변화가 있는 편이다.", subtitleEn: "Mood weather shifts more than you'd like.", subtitleKo: "기분이라는 날씨가 자주 바뀐다." },
  { id: 30, trait: "openness", reverse: false, en: "Values artistic, aesthetic experiences.", ko: "예술적이고 미적인 경험을 중요하게 여긴다.", subtitleEn: "Beauty registers as actual data, not decoration.", subtitleKo: "아름다움이 장식이 아니라 신호로 들어온다." },
  { id: 31, trait: "extraversion", reverse: true, en: "Is sometimes shy, inhibited.", ko: "수줍어하거나 위축될 때가 있다.", subtitleEn: "Going first costs more energy than going later.", subtitleKo: "먼저 나서는 게 나중에 나서는 것보다 힘들다." },
  { id: 32, trait: "agreeableness", reverse: false, en: "Is considerate and kind to almost everyone.", ko: "거의 모든 사람에게 친절하고 배려심 있다.", subtitleEn: "Default mode is kind, not transactional.", subtitleKo: "기본 모드가 거래보다 친절." },
  { id: 33, trait: "conscientiousness", reverse: false, en: "Does things efficiently.", ko: "효율적으로 일을 처리하는 편이다.", subtitleEn: "Looks for the shorter path before starting.", subtitleKo: "시작 전에 짧은 경로를 먼저 찾아본다." },
  { id: 34, trait: "neuroticism", reverse: true, en: "Remains calm in tense situations.", ko: "긴장된 상황에서도 차분함을 유지한다.", subtitleEn: "Pressure narrows attention rather than rattles it.", subtitleKo: "압박이 집중을 모으지, 흔들지 않는 편." },
  { id: 35, trait: "openness", reverse: true, en: "Prefers work that is routine.", ko: "반복적이고 일상적인 일을 더 좋아한다.", subtitleEn: "Predictability feels better than novelty.", subtitleKo: "새로움보다 예측 가능한 쪽이 편하다." },
  { id: 36, trait: "extraversion", reverse: false, en: "Is outgoing, sociable.", ko: "사교적이고 활발하다.", subtitleEn: "Meeting new people doesn't drain you.", subtitleKo: "새로운 사람을 만나는 게 진을 빼지 않는다." },
  { id: 37, trait: "agreeableness", reverse: true, en: "Is sometimes rude to others.", ko: "남에게 무례하게 굴 때가 있다.", subtitleEn: "Politeness slips when bandwidth is low.", subtitleKo: "여유가 없을 때 예의가 같이 사라진다." },
  { id: 38, trait: "conscientiousness", reverse: false, en: "Makes plans and follows through with them.", ko: "계획을 세우고 끝까지 실행한다.", subtitleEn: "Your calendar maps onto your actual week.", subtitleKo: "달력이 실제 한 주와 거의 일치한다." },
  { id: 39, trait: "neuroticism", reverse: false, en: "Gets nervous easily.", ko: "쉽게 긴장하는 편이다.", subtitleEn: "Stakes turn into stomach knots quickly.", subtitleKo: "긴장 상황이 위 신호로 빨리 옮아간다." },
  { id: 40, trait: "openness", reverse: false, en: "Likes to reflect, play with ideas.", ko: "깊이 생각하고 아이디어를 가지고 노는 걸 좋아한다.", subtitleEn: "Idle time becomes idea time, not lost time.", subtitleKo: "한가한 시간이 잃은 시간보다 아이디어 시간이 된다." },
  { id: 41, trait: "openness", reverse: true, en: "Has few artistic interests.", ko: "예술적인 관심사가 적은 편이다.", subtitleEn: "Art doesn't pull at you the way it pulls at others.", subtitleKo: "예술이 남들만큼 끌어당기진 않는다." },
  { id: 42, trait: "agreeableness", reverse: false, en: "Likes to cooperate with others.", ko: "다른 사람과 협력하는 걸 좋아한다.", subtitleEn: "Prefers building together over alone.", subtitleKo: "혼자보다 같이 만드는 쪽을 선호." },
  { id: 43, trait: "conscientiousness", reverse: true, en: "Is easily distracted.", ko: "쉽게 산만해지는 편이다.", subtitleEn: "Notifications, tabs, side thoughts — they all win.", subtitleKo: "알림 · 탭 · 곁가지 생각이 자주 이긴다." },
  { id: 44, trait: "openness", reverse: false, en: "Is sophisticated in art, music, or literature.", ko: "예술 · 음악 · 문학에 조예가 있는 편이다.", subtitleEn: "Knows the difference between styles, not just titles.", subtitleKo: "제목이 아니라 스타일 차이까지 구분이 된다." },
] as const;

export type BfiResponses = Partial<Record<number, number>>;

export interface BfiScore {
  trait: BigFiveTrait;
  /** Mean of the trait items on the 1-5 scale. */
  score: number;
}

export interface BfiResult {
  scores: BfiScore[];
  byTrait: Record<BigFiveTrait, number>;
  answered: number;
  complete: boolean;
}

function reverseScore(value: number): number {
  return 6 - value;
}

export function scoreBfi(responses: BfiResponses): BfiResult {
  const traitSums: Record<BigFiveTrait, { sum: number; count: number }> = {
    extraversion: { sum: 0, count: 0 },
    agreeableness: { sum: 0, count: 0 },
    conscientiousness: { sum: 0, count: 0 },
    neuroticism: { sum: 0, count: 0 },
    openness: { sum: 0, count: 0 },
  };

  let answered = 0;
  for (const item of BFI_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 5 || !Number.isFinite(raw)) continue;
    answered += 1;
    const value = item.reverse ? reverseScore(raw) : raw;
    traitSums[item.trait].sum += value;
    traitSums[item.trait].count += 1;
  }

  const scores: BfiScore[] = [];
  const byTrait: Record<BigFiveTrait, number> = {
    extraversion: 0,
    agreeableness: 0,
    conscientiousness: 0,
    neuroticism: 0,
    openness: 0,
  };
  for (const trait of Object.keys(traitSums) as BigFiveTrait[]) {
    const { sum, count } = traitSums[trait];
    const mean = count > 0 ? sum / count : 0;
    scores.push({ trait, score: mean });
    byTrait[trait] = mean;
  }

  return { scores, byTrait, answered, complete: answered === BFI_ITEMS.length };
}

export const TRAIT_LABEL_EN: Record<BigFiveTrait, string> = {
  extraversion: "Extraversion",
  agreeableness: "Agreeableness",
  conscientiousness: "Conscientiousness",
  neuroticism: "Neuroticism",
  openness: "Openness to Experience",
};

export const TRAIT_LABEL_KO: Record<BigFiveTrait, string> = {
  extraversion: "외향성",
  agreeableness: "친화성",
  conscientiousness: "성실성",
  neuroticism: "신경성",
  openness: "경험 개방성",
};

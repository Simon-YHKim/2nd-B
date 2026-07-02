// IPIP-NEO-120 — International Personality Item Pool representation of the NEO-PI-R,
// 120-item version (Johnson, J. A. (2014). Measuring thirty facets of the Five Factor
// Model with a 120-item public domain inventory. J. Research in Personality 51, 78-89).
//
// Measures the Big Five at TWO levels: the 5 domains AND their 30 facets (6 per
// domain x 4 items = 120). This is the "facet-precision" upgrade over BFI-44
// (domain-only) — it tells you WHICH KIND of, e.g., extraversion (friendliness vs
// assertiveness vs excitement-seeking). 5-point Likert (Very inaccurate -> Very
// accurate). The DOMAIN scores are the same 5 axes as BFI-44, so the persona /
// constellation downstream consumes them unchanged; the 30 facets are the new layer.
//
// SOURCES & VALIDITY:
//  - EN item stems are PUBLIC DOMAIN (IPIP) and kept VERBATIM to preserve validity.
//  - The keying (+/-) + facet assignment match Johnson's published key exactly
//    (verified: domain 24x5, facet 4x30, keyed-proportions N71/E75/O50/A29/C46%).
//  - KO translations are a community translation (Alheimsins b5-johnson-120-ipip-neo-pi-r,
//    MIT) and are NOT a psychometrically VALIDATED Korean version. There is no
//    published validated Korean IPIP-NEO; KO must be surfaced to users as a
//    reference/non-validated translation (Simon decision 2026-07-01). EN is the
//    validated channel.
//
// Scoring here is pure + LLM-free, mirroring bfi.ts.

import { bfiMeanToPercent, type BigFiveTrait } from "./bfi";

export interface IpipItem {
  /** 1-based item number in the IPIP-NEO-120 presentation order. */
  id: number;
  /** Big Five domain this item loads on (same 5 axes as BFI-44). */
  domain: BigFiveTrait;
  /** Facet number 1-6 within the domain. */
  facet: number;
  /** Stable facet key (e.g. "anxiety"); 30 across the 5 domains. */
  facetKey: string;
  /** True if the item is reverse-keyed (minus). */
  reverse: boolean;
  /** Item stem in EN — VERBATIM public-domain IPIP (do not alter; validity). */
  en: string;
  /** Item stem in KO — community translation, NOT validated. */
  ko: string;
}

export const IPIP_NEO_120_ITEMS: readonly IpipItem[] = [
  { id: 1, domain: "neuroticism", facet: 1, facetKey: "anxiety", reverse: false, en: "Worry about things", ko: "나는 걱정이 많은 편이다." },
  { id: 2, domain: "extraversion", facet: 1, facetKey: "friendliness", reverse: false, en: "Make friends easily", ko: "나는 쉽게 친구를 사귀는 편이다." },
  { id: 3, domain: "openness", facet: 1, facetKey: "imagination", reverse: false, en: "Have a vivid imagination", ko: "나는 상상력이 풍부한 편이다." },
  { id: 4, domain: "agreeableness", facet: 1, facetKey: "trust", reverse: false, en: "Trust others", ko: "나는 다른 사람들을 신뢰하는 편이다." },
  { id: 5, domain: "conscientiousness", facet: 1, facetKey: "self_efficacy", reverse: false, en: "Complete tasks successfully", ko: "나는 일을 제대로 끝 마치는 편이다." },
  { id: 6, domain: "neuroticism", facet: 2, facetKey: "anger", reverse: false, en: "Get angry easily", ko: "나는 쉽게 화를 내는 편이다." },
  { id: 7, domain: "extraversion", facet: 2, facetKey: "gregariousness", reverse: false, en: "Love large parties", ko: "나는 다른 사람들이 많은 파티를 좋아하는 편이다." },
  { id: 8, domain: "openness", facet: 2, facetKey: "artistic_interests", reverse: false, en: "Believe in the importance of art", ko: "나는 예술이 중요하다고 믿는 편이다." },
  { id: 9, domain: "agreeableness", facet: 2, facetKey: "morality", reverse: true, en: "Use others for my own ends", ko: "나는 내 목적을 위해 다른 사람들을 이용하는 편이다." },
  { id: 10, domain: "conscientiousness", facet: 2, facetKey: "orderliness", reverse: false, en: "Like to tidy up", ko: "나는 정리하는 것을 좋아하는 편이다." },
  { id: 11, domain: "neuroticism", facet: 3, facetKey: "depression", reverse: false, en: "Often feel blue", ko: "나는 종종 우울함을 느끼는 편이다." },
  { id: 12, domain: "extraversion", facet: 3, facetKey: "assertiveness", reverse: false, en: "Take charge", ko: "나는 리더로서 자질을 가졌다고 생각하는 편이다." },
  { id: 13, domain: "openness", facet: 3, facetKey: "emotionality", reverse: false, en: "Experience my emotions intensely", ko: "나는 종종 감정에 지배당하는 편이다." },
  { id: 14, domain: "agreeableness", facet: 3, facetKey: "altruism", reverse: false, en: "Love to help others", ko: "나는 남을 돕는 것을 좋아하는 편이다." },
  { id: 15, domain: "conscientiousness", facet: 3, facetKey: "dutifulness", reverse: false, en: "Keep my promises", ko: "나는 약속을 잘 지키는 편이다." },
  { id: 16, domain: "neuroticism", facet: 4, facetKey: "self_consciousness", reverse: false, en: "Find it difficult to approach others", ko: "나는 다른 사람에게 다가가는 것을 어려워하는 편이다." },
  { id: 17, domain: "extraversion", facet: 4, facetKey: "activity_level", reverse: false, en: "Am always busy", ko: "나는 항상 바쁜 편이다." },
  { id: 18, domain: "openness", facet: 4, facetKey: "adventurousness", reverse: false, en: "Prefer variety to routine", ko: "나는 틀에 박히지 않은 것을 좋아하는 편이다." },
  { id: 19, domain: "agreeableness", facet: 4, facetKey: "cooperation", reverse: true, en: "Love a good fight", ko: "나는 건강한 논쟁을 즐기는 편이다." },
  { id: 20, domain: "conscientiousness", facet: 4, facetKey: "achievement_striving", reverse: false, en: "Work hard", ko: "나는 열심히 일하는 편이다." },
  { id: 21, domain: "neuroticism", facet: 5, facetKey: "immoderation", reverse: false, en: "Go on binges", ko: "나는 폭식을 하는 편이다." },
  { id: 22, domain: "extraversion", facet: 5, facetKey: "excitement_seeking", reverse: false, en: "Love excitement", ko: "나는 신나는 걸 좋아하는 편이다." },
  { id: 23, domain: "openness", facet: 5, facetKey: "intellect", reverse: false, en: "Love to read challenging material", ko: "나는 도전적인 자료를 읽는 것을 좋아하는 편이다." },
  { id: 24, domain: "agreeableness", facet: 5, facetKey: "modesty", reverse: true, en: "Believe that I am better than others", ko: "나는 내가 다른 사람보다 낫다고 믿는 편이다." },
  { id: 25, domain: "conscientiousness", facet: 5, facetKey: "self_discipline", reverse: false, en: "Am always prepared", ko: "나는 항상 준비되어있는 편이다." },
  { id: 26, domain: "neuroticism", facet: 6, facetKey: "vulnerability", reverse: false, en: "Panic easily", ko: "나는 공황 상태에 쉽게 빠지는 편이다." },
  { id: 27, domain: "extraversion", facet: 6, facetKey: "cheerfulness", reverse: false, en: "Radiate joy", ko: "나는 기쁠 때, 티내는 편이다." },
  { id: 28, domain: "openness", facet: 6, facetKey: "liberalism", reverse: false, en: "Tend to vote for liberal political candidates", ko: "나는 진보적인 정치가에게 투표하는 경향이 있는 편이다." },
  { id: 29, domain: "agreeableness", facet: 6, facetKey: "sympathy", reverse: false, en: "Sympathize with the homeless", ko: "나는 노숙자들에게 동정을 느끼는 편이다." },
  { id: 30, domain: "conscientiousness", facet: 6, facetKey: "cautiousness", reverse: true, en: "Jump into things without thinking", ko: "나는 앞뒤 생각 없이 뛰어드는 경향이 있는 편이다." },
  { id: 31, domain: "neuroticism", facet: 1, facetKey: "anxiety", reverse: false, en: "Fear for the worst", ko: "나는 안 좋은 일에 대해 두려워하는 편이다." },
  { id: 32, domain: "extraversion", facet: 1, facetKey: "friendliness", reverse: false, en: "Feel comfortable around people", ko: "나는 다른 사람들 주변에 있을 때, 편안함을 느끼는 편이다." },
  { id: 33, domain: "openness", facet: 1, facetKey: "imagination", reverse: false, en: "Enjoy wild flights of fantasy", ko: "나는 공상의 나래를 즐기는 편이다." },
  { id: 34, domain: "agreeableness", facet: 1, facetKey: "trust", reverse: false, en: "Believe that others have good intentions", ko: "나는 다른 사람들이 좋은 의도를 가지고 있다고 믿는 편이다." },
  { id: 35, domain: "conscientiousness", facet: 1, facetKey: "self_efficacy", reverse: false, en: "Excel in what I do", ko: "나는 내가 하는 일에 대해 남들보다 뛰어난 편이다." },
  { id: 36, domain: "neuroticism", facet: 2, facetKey: "anger", reverse: false, en: "Get irritated easily", ko: "나는 쉽게 짜증을 내는 편이다." },
  { id: 37, domain: "extraversion", facet: 2, facetKey: "gregariousness", reverse: false, en: "Talk to a lot of different people at parties", ko: "나는 파티에서 많은 다른 사람들과 이야기를 하는 편이다." },
  { id: 38, domain: "openness", facet: 2, facetKey: "artistic_interests", reverse: false, en: "See beauty in things that others might not notice", ko: "나는 다른 사람들이 알아차리지 못하는 것에서 아름다움을 보는 편이다." },
  { id: 39, domain: "agreeableness", facet: 2, facetKey: "morality", reverse: true, en: "Cheat to get ahead", ko: "나는 원하는 것을 얻기 위해 부정 행위를 하는 편이다." },
  { id: 40, domain: "conscientiousness", facet: 2, facetKey: "orderliness", reverse: true, en: "Often forget to put things back in their proper place", ko: "나는 물건을 제자리에 놓는 것을 종종 잊어버리는 편이다." },
  { id: 41, domain: "neuroticism", facet: 3, facetKey: "depression", reverse: false, en: "Dislike myself", ko: "나는 내 자신을 싫어하는 편이다." },
  { id: 42, domain: "extraversion", facet: 3, facetKey: "assertiveness", reverse: false, en: "Try to lead others", ko: "나는 다른 사람들을 이끄려고 노력하는 편이다." },
  { id: 43, domain: "openness", facet: 3, facetKey: "emotionality", reverse: false, en: "Feel others' emotions", ko: "나는 다른 사람들의 감정에 공감하는 편이다." },
  { id: 44, domain: "agreeableness", facet: 3, facetKey: "altruism", reverse: false, en: "Am concerned about others", ko: "나는 다른 사람들을 걱정하는 편이다." },
  { id: 45, domain: "conscientiousness", facet: 3, facetKey: "dutifulness", reverse: false, en: "Tell the truth", ko: "나는 진실대로 말하는 편이다." },
  { id: 46, domain: "neuroticism", facet: 4, facetKey: "self_consciousness", reverse: false, en: "Am afraid to draw attention to myself", ko: "나는 나에 대해 관심을 가지는 것을 두려워하는 편이다." },
  { id: 47, domain: "extraversion", facet: 4, facetKey: "activity_level", reverse: false, en: "Am always on the go", ko: "나는 언제나 바쁘게 움직이는 편이다." },
  { id: 48, domain: "openness", facet: 4, facetKey: "adventurousness", reverse: true, en: "Prefer to stick with things that I know", ko: "나는 내가 아는 것에 생각하는 것을 선호하는 편이다." },
  { id: 49, domain: "agreeableness", facet: 4, facetKey: "cooperation", reverse: true, en: "Yell at people", ko: "나는 다른 사람들에게 호통치는 편이다." },
  { id: 50, domain: "conscientiousness", facet: 4, facetKey: "achievement_striving", reverse: false, en: "Do more than what's expected of me", ko: "나는 내게 기대했던 것 보다 더 많은 일을 하는 편이다." },
  { id: 51, domain: "neuroticism", facet: 5, facetKey: "immoderation", reverse: true, en: "Rarely overindulge", ko: "나는 과식을 하지 않는 편이다." },
  { id: 52, domain: "extraversion", facet: 5, facetKey: "excitement_seeking", reverse: false, en: "Seek adventure", ko: "나는 무언가 색다른 일을 찾아 다니는 편이다." },
  { id: 53, domain: "openness", facet: 5, facetKey: "intellect", reverse: true, en: "Avoid philosophical discussions", ko: "나는 철학적인 논쟁을 피하는 편이다." },
  { id: 54, domain: "agreeableness", facet: 5, facetKey: "modesty", reverse: true, en: "Think highly of myself", ko: "나는 내 자신을 높게 평가하는 편이다." },
  { id: 55, domain: "conscientiousness", facet: 5, facetKey: "self_discipline", reverse: false, en: "Carry out my plans", ko: "나는 내 계획들을 잘 실행하는 편이다." },
  { id: 56, domain: "neuroticism", facet: 6, facetKey: "vulnerability", reverse: false, en: "Become overwhelmed by events", ko: "나는 어떤 일 때문에 어쩔 줄 모르게 되는 편이다." },
  { id: 57, domain: "extraversion", facet: 6, facetKey: "cheerfulness", reverse: false, en: "Have a lot of fun", ko: "나는 재미있는 사람인 편이다." },
  { id: 58, domain: "openness", facet: 6, facetKey: "liberalism", reverse: false, en: "Believe that there is no absolute right and wrong", ko: "나는 절대적으로 옮고 그름은 없다고 믿는 편이다." },
  { id: 59, domain: "agreeableness", facet: 6, facetKey: "sympathy", reverse: false, en: "Feel sympathy for those who are worse off than myself", ko: "나는 나보다 가난한 사람에게 동정을 느끼는 편이다." },
  { id: 60, domain: "conscientiousness", facet: 6, facetKey: "cautiousness", reverse: true, en: "Make rash decisions", ko: "나는 성급하게 결정을 내리는 편이다." },
  { id: 61, domain: "neuroticism", facet: 1, facetKey: "anxiety", reverse: false, en: "Am afraid of many things", ko: "나는 많은 것들을 두려워하는 편이다." },
  { id: 62, domain: "extraversion", facet: 1, facetKey: "friendliness", reverse: true, en: "Avoid contacts with others", ko: "나는 다른 사람들과 접촉을 피하는 편이다." },
  { id: 63, domain: "openness", facet: 1, facetKey: "imagination", reverse: false, en: "Love to daydream", ko: "나는 몽상을 좋아하는 편이다." },
  { id: 64, domain: "agreeableness", facet: 1, facetKey: "trust", reverse: false, en: "Trust what people say", ko: "나는 다른 사람들이 말하는 것을 믿는 편이다." },
  { id: 65, domain: "conscientiousness", facet: 1, facetKey: "self_efficacy", reverse: false, en: "Handle tasks smoothly", ko: "나는 일을 매끄럽게 처리하는 편이다." },
  { id: 66, domain: "neuroticism", facet: 2, facetKey: "anger", reverse: false, en: "Lose my temper", ko: "나는 화가날 때 평정을 유지하기 어려운 편이다." },
  { id: 67, domain: "extraversion", facet: 2, facetKey: "gregariousness", reverse: true, en: "Prefer to be alone", ko: "나는 혼자 있는게 더 좋은 편이다." },
  { id: 68, domain: "openness", facet: 2, facetKey: "artistic_interests", reverse: true, en: "Do not like poetry", ko: "나는 시를 좋아하지 않는 편이다." },
  { id: 69, domain: "agreeableness", facet: 2, facetKey: "morality", reverse: true, en: "Take advantage of others", ko: "나는 다른 사람들을 이용하는 편이다." },
  { id: 70, domain: "conscientiousness", facet: 2, facetKey: "orderliness", reverse: true, en: "Leave a mess in my room", ko: "나는 내 방을 어지르는 편이다." },
  { id: 71, domain: "neuroticism", facet: 3, facetKey: "depression", reverse: false, en: "Am often down in the dumps", ko: "나는 자주 의기소침하는 편이다." },
  { id: 72, domain: "extraversion", facet: 3, facetKey: "assertiveness", reverse: false, en: "Take control of things", ko: "나는 일을 내가 원하는대로 추진하려고 하는 편이다." },
  { id: 73, domain: "openness", facet: 3, facetKey: "emotionality", reverse: true, en: "Rarely notice my emotional reactions", ko: "나는 내 감정에 대해 둔한 편이다." },
  { id: 74, domain: "agreeableness", facet: 3, facetKey: "altruism", reverse: true, en: "Am indifferent to the feelings of others", ko: "나는 다른 사람들의 감정에 대해 무관심한 편이다." },
  { id: 75, domain: "conscientiousness", facet: 3, facetKey: "dutifulness", reverse: true, en: "Break rules", ko: "나는 규칙을 어기는 편이다." },
  { id: 76, domain: "neuroticism", facet: 4, facetKey: "self_consciousness", reverse: false, en: "Only feel comfortable with friends", ko: "나는 친구들과 함께 있을 때 편안함을 느끼는 편이다." },
  { id: 77, domain: "extraversion", facet: 4, facetKey: "activity_level", reverse: false, en: "Do a lot in my spare time", ko: "나는 여가 시간에 많은 것을 하는 편이다." },
  { id: 78, domain: "openness", facet: 4, facetKey: "adventurousness", reverse: true, en: "Dislike changes", ko: "나는 변화가 싫은 편이다." },
  { id: 79, domain: "agreeableness", facet: 4, facetKey: "cooperation", reverse: true, en: "Insult people", ko: "나는 다른 사람들을 욕하는 편이다." },
  { id: 80, domain: "conscientiousness", facet: 4, facetKey: "achievement_striving", reverse: true, en: "Do just enough work to get by", ko: "나는 그럭 저럭 살아갈 만큼 일하는 편이다." },
  { id: 81, domain: "neuroticism", facet: 5, facetKey: "immoderation", reverse: true, en: "Easily resist temptations", ko: "나는 유혹에 잘 빠져들지 않는 편이다." },
  { id: 82, domain: "extraversion", facet: 5, facetKey: "excitement_seeking", reverse: false, en: "Enjoy being reckless", ko: "나는 앞 뒤 재지 않고 행동하는 편이다." },
  { id: 83, domain: "openness", facet: 5, facetKey: "intellect", reverse: true, en: "Have difficulty understanding abstract ideas", ko: "나는 추상적인 개념을 이해하는 것이 어려운 편이다." },
  { id: 84, domain: "agreeableness", facet: 5, facetKey: "modesty", reverse: true, en: "Have a high opinion of myself", ko: "나는 나 자신이 괜찮은 사람이라 생각하는 편이다." },
  { id: 85, domain: "conscientiousness", facet: 5, facetKey: "self_discipline", reverse: true, en: "Waste my time", ko: "나는 내 시간을 낭비하는 편이다." },
  { id: 86, domain: "neuroticism", facet: 6, facetKey: "vulnerability", reverse: false, en: "Feel that I'm unable to deal with things", ko: "나는 내가 일을 감당할 수 없다고 느끼는 편이다." },
  { id: 87, domain: "extraversion", facet: 6, facetKey: "cheerfulness", reverse: false, en: "Love life", ko: "나는 살아있는게 좋은 편이다." },
  { id: 88, domain: "openness", facet: 6, facetKey: "liberalism", reverse: true, en: "Tend to vote for conservative political candidates", ko: "나는 보수적인 정치인에게 투표하는 경향이 있는 편이다." },
  { id: 89, domain: "agreeableness", facet: 6, facetKey: "sympathy", reverse: true, en: "Am not interested in other people's problems", ko: "나는 남들의 문제에 관심이 없는 편이다." },
  { id: 90, domain: "conscientiousness", facet: 6, facetKey: "cautiousness", reverse: true, en: "Rush into things", ko: "나는 서둘러 일을 처리하는 편이다." },
  { id: 91, domain: "neuroticism", facet: 1, facetKey: "anxiety", reverse: false, en: "Get stressed out easily", ko: "나는 쉽게 스트레스를 받는 편이다." },
  { id: 92, domain: "extraversion", facet: 1, facetKey: "friendliness", reverse: true, en: "Keep others at a distance", ko: "나는 남과 거리를 두는 편이다." },
  { id: 93, domain: "openness", facet: 1, facetKey: "imagination", reverse: false, en: "Like to get lost in thought", ko: "나는 사색에 잠기는 것을 즐기는 편이다." },
  { id: 94, domain: "agreeableness", facet: 1, facetKey: "trust", reverse: true, en: "Distrust people", ko: "나는 다른 사람들을 잘 믿지 않는 편이다." },
  { id: 95, domain: "conscientiousness", facet: 1, facetKey: "self_efficacy", reverse: false, en: "Know how to get things done", ko: "나는 일을 어떻게 해나가야하는지 잘 아는 편이다." },
  { id: 96, domain: "neuroticism", facet: 2, facetKey: "anger", reverse: true, en: "Am not easily annoyed", ko: "나는 쉽게 짜증 내지 않는 편이다." },
  { id: 97, domain: "extraversion", facet: 2, facetKey: "gregariousness", reverse: true, en: "Avoid crowds", ko: "나는 다른 사람들이 많은 곳을 피하는 편이다." },
  { id: 98, domain: "openness", facet: 2, facetKey: "artistic_interests", reverse: true, en: "Do not enjoy going to art museums", ko: "나는 미술관에 가는 것을 좋아하지 않는 편이다." },
  { id: 99, domain: "agreeableness", facet: 2, facetKey: "morality", reverse: true, en: "Obstruct others' plans", ko: "나는 다른 사람들의 계획을 방해하는 편이다." },
  { id: 100, domain: "conscientiousness", facet: 2, facetKey: "orderliness", reverse: true, en: "Leave my belongings around", ko: "나는 내 물건을 잘 잃어버리는 편이다." },
  { id: 101, domain: "neuroticism", facet: 3, facetKey: "depression", reverse: true, en: "Feel comfortable with myself", ko: "나는 내 자신에 대해 편안함을 느끼는 편이다." },
  { id: 102, domain: "extraversion", facet: 3, facetKey: "assertiveness", reverse: true, en: "Wait for others to lead the way", ko: "나는 남들이 앞서길 기다리는 편이다." },
  { id: 103, domain: "openness", facet: 3, facetKey: "emotionality", reverse: true, en: "Don't understand people who get emotional", ko: "나는 감정적인 사람들이 이해 못 하는 편이다." },
  { id: 104, domain: "agreeableness", facet: 3, facetKey: "altruism", reverse: true, en: "Take no time for others", ko: "나는 남을 위해 시간을 들이지 않는 편이다." },
  { id: 105, domain: "conscientiousness", facet: 3, facetKey: "dutifulness", reverse: true, en: "Break my promises", ko: "나는 약속을 어기는 편이다." },
  { id: 106, domain: "neuroticism", facet: 4, facetKey: "self_consciousness", reverse: true, en: "Am not bothered by difficult social situations", ko: "나는 어려운 사회 상황에 개의치 않는 편이다." },
  { id: 107, domain: "extraversion", facet: 4, facetKey: "activity_level", reverse: true, en: "Like to take it easy", ko: "나는 느긋하게 지내는 것을 좋아하는 편이다." },
  { id: 108, domain: "openness", facet: 4, facetKey: "adventurousness", reverse: true, en: "Am attached to conventional ways", ko: "나는 전통적인 방식에 대해 애착을 가지고 있는 편이다." },
  { id: 109, domain: "agreeableness", facet: 4, facetKey: "cooperation", reverse: true, en: "Get back at others", ko: "나는 당한 것에 대해 남들에게 (앙)갚는 편이다." },
  { id: 110, domain: "conscientiousness", facet: 4, facetKey: "achievement_striving", reverse: true, en: "Put little time and effort into my work", ko: "나는 내 일에 시간과 노력을 들이지 않는 편이다." },
  { id: 111, domain: "neuroticism", facet: 5, facetKey: "immoderation", reverse: true, en: "Am able to control my cravings", ko: "나는 내 갈망을 조절 할 수 있는 편이다." },
  { id: 112, domain: "extraversion", facet: 5, facetKey: "excitement_seeking", reverse: false, en: "Act wild and crazy", ko: "나는 미친 듯이 행동하는 편이다." },
  { id: 113, domain: "openness", facet: 5, facetKey: "intellect", reverse: true, en: "Am not interested in theoretical discussions", ko: "나는 이론적인 토론에 대해 관심이 없는 편이다." },
  { id: 114, domain: "agreeableness", facet: 5, facetKey: "modesty", reverse: true, en: "Boast about my virtues", ko: "나는 내 선행에 대해 자랑하는 편이다." },
  { id: 115, domain: "conscientiousness", facet: 5, facetKey: "self_discipline", reverse: true, en: "Have difficulty starting tasks", ko: "나는 작업을 시작하는데 어려움이 있는 편이다." },
  { id: 116, domain: "neuroticism", facet: 6, facetKey: "vulnerability", reverse: true, en: "Remain calm under pressure", ko: "나는 중압감 속에서 침착함을 유지하는 편이다." },
  { id: 117, domain: "extraversion", facet: 6, facetKey: "cheerfulness", reverse: false, en: "Look at the bright side of life", ko: "나는 인생을 긍정적으로 바라보는 편이다." },
  { id: 118, domain: "openness", facet: 6, facetKey: "liberalism", reverse: true, en: "Believe that we should be tough on crime", ko: "나는 우리가 범죄에 엄격해야한다고 믿는 편이다." },
  { id: 119, domain: "agreeableness", facet: 6, facetKey: "sympathy", reverse: true, en: "Try not to think about the needy", ko: "나는 가난한 사람에 대해 별로 생각하고 싶지 않아하는 편이다." },
  { id: 120, domain: "conscientiousness", facet: 6, facetKey: "cautiousness", reverse: true, en: "Act without thinking", ko: "나는 별 생각 없이 행동하는 편이다." },
] as const;

export type IpipResponses = Partial<Record<number, number>>;

export interface IpipResult {
  /** Mean (1-5) per domain over its 24 items, after reverse-coding. */
  domains: Record<BigFiveTrait, number>;
  /** Mean (1-5) per facetKey over its 4 items, after reverse-coding. */
  facets: Record<string, number>;
  answered: number;
  complete: boolean;
}

/** Reverse-key a 1-5 response: 1<->5, 2<->4, 3<->3 (same as BFI). */
function reverseScore(value: number): number {
  return 6 - value;
}

export function scoreIpipNeo(responses: IpipResponses): IpipResult {
  const dom: Record<BigFiveTrait, { sum: number; count: number }> = {
    extraversion: { sum: 0, count: 0 },
    agreeableness: { sum: 0, count: 0 },
    conscientiousness: { sum: 0, count: 0 },
    neuroticism: { sum: 0, count: 0 },
    openness: { sum: 0, count: 0 },
  };
  const fac: Record<string, { sum: number; count: number }> = {};
  let answered = 0;
  for (const item of IPIP_NEO_120_ITEMS) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || raw < 1 || raw > 5 || !Number.isFinite(raw)) continue;
    answered += 1;
    const value = item.reverse ? reverseScore(raw) : raw;
    dom[item.domain].sum += value;
    dom[item.domain].count += 1;
    fac[item.facetKey] ??= { sum: 0, count: 0 };
    fac[item.facetKey].sum += value;
    fac[item.facetKey].count += 1;
  }
  const domains = {
    extraversion: 0, agreeableness: 0, conscientiousness: 0, neuroticism: 0, openness: 0,
  } as Record<BigFiveTrait, number>;
  for (const k of Object.keys(dom) as BigFiveTrait[]) {
    domains[k] = dom[k].count > 0 ? dom[k].sum / dom[k].count : 0;
  }
  const facets: Record<string, number> = {};
  for (const k of Object.keys(fac)) {
    facets[k] = fac[k].count > 0 ? fac[k].sum / fac[k].count : 0;
  }
  return { domains, facets, answered, complete: answered === IPIP_NEO_120_ITEMS.length };
}

/** 1-5 mean -> 0-100 bar percentage, identical anchor to the persona/BFI bars. */
export const ipipMeanToPercent = bfiMeanToPercent;

/** The 30 facet keys grouped by domain, in Johnson's facet order (1-6). */
export const FACETS_BY_DOMAIN: Record<BigFiveTrait, readonly string[]> = {
  neuroticism: ["anxiety", "anger", "depression", "self_consciousness", "immoderation", "vulnerability"],
  extraversion: ["friendliness", "gregariousness", "assertiveness", "activity_level", "excitement_seeking", "cheerfulness"],
  openness: ["imagination", "artistic_interests", "emotionality", "adventurousness", "intellect", "liberalism"],
  agreeableness: ["trust", "morality", "altruism", "cooperation", "modesty", "sympathy"],
  conscientiousness: ["self_efficacy", "orderliness", "dutifulness", "achievement_striving", "self_discipline", "cautiousness"],
} as const;

export const FACET_LABEL: Record<"en" | "ko", Record<string, string>> = {
  en: {
    anxiety: "Anxiety", anger: "Anger", depression: "Depression", self_consciousness: "Self-Consciousness", immoderation: "Immoderation", vulnerability: "Vulnerability",
    friendliness: "Friendliness", gregariousness: "Gregariousness", assertiveness: "Assertiveness", activity_level: "Activity Level", excitement_seeking: "Excitement-Seeking", cheerfulness: "Cheerfulness",
    imagination: "Imagination", artistic_interests: "Artistic Interests", emotionality: "Emotionality", adventurousness: "Adventurousness", intellect: "Intellect", liberalism: "Liberalism",
    trust: "Trust", morality: "Morality", altruism: "Altruism", cooperation: "Cooperation", modesty: "Modesty", sympathy: "Sympathy",
    self_efficacy: "Self-Efficacy", orderliness: "Orderliness", dutifulness: "Dutifulness", achievement_striving: "Achievement-Striving", self_discipline: "Self-Discipline", cautiousness: "Cautiousness",
  },
  ko: {
    anxiety: "불안", anger: "분노", depression: "우울감", self_consciousness: "자의식", immoderation: "무절제", vulnerability: "취약성",
    friendliness: "친밀함", gregariousness: "사교성", assertiveness: "주장성", activity_level: "활동성", excitement_seeking: "자극 추구", cheerfulness: "쾌활함",
    imagination: "상상력", artistic_interests: "예술적 관심", emotionality: "정서성", adventurousness: "모험심", intellect: "지성", liberalism: "진보성",
    trust: "신뢰", morality: "도덕성", altruism: "이타성", cooperation: "협력", modesty: "겸손", sympathy: "공감",
    self_efficacy: "자기효능감", orderliness: "정돈성", dutifulness: "책임감", achievement_striving: "성취 추구", self_discipline: "자기 절제", cautiousness: "신중함",
  },
} as const;

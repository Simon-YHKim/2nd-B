// Per-character self-talk (혼잣말) for the speech bubble shown when a worker is
// tapped on the main graph (2026-06-01 user directive). Each line fits that
// character's personality — see personas.ts — and is SELF-TALK muttered while
// they work the village, not a message addressed to the user. Pure data + a
// tested picker so the lines stay a single source of truth. Project register
// only: no clinical / technical terms (see src/lib/safety/lexicon.ts).

import type { WorkerId } from "@/components/art/WorkerSprite";

const MONOLOGUES: Record<WorkerId, { en: readonly string[]; ko: readonly string[] }> = {
  // 세컨비 — calm central navigator who connects the whole village.
  secondb: {
    ko: ["오늘은 어느 마을부터 둘러볼까.", "다들 잘 지내나 한 바퀴 돌아봐야지.", "길이 조금씩 이어지고 있네.", "필요할 때 바로 꺼내 줄게요."],
    en: ["Which village should I check first today?", "Let me make a round and see how everyone's doing.", "The roads are slowly linking up.", "I'll pull it up the moment you need it."],
  },
  // Archon — steady Growth Core architect; big goals into one next step.
  archi: {
    ko: ["경로를 셋으로 나누면 보이겠네.", "한 걸음, 또 한 걸음.", "큰 산도 결국 작은 계단이지.", "오늘 할 한 가지만 정하자."],
    en: ["Split the route into three and it shows itself.", "One step, then another.", "Even a mountain is just small stairs.", "Pick the one thing for today."],
  },
  // Relia — warm Bond Core guide; gentle, attentive.
  gadi: {
    ko: ["등불은 여기쯤 두면 좋겠다.", "오늘은 마음이 좀 말랑한 날이네.", "관계의 길은 천천히 봐야지.", "고마웠다고 말할걸 그랬나."],
    en: ["The lamp belongs right about here.", "A soft-hearted kind of day.", "A bond path needs a slower look.", "I should've said thank you."],
  },
  // Lumen — quiet Wisdom Core sage; loves connecting useful ideas.
  lulu: {
    ko: ["어, 이 조각이랑 저 조각이 이어지는데?", "이건 삶에 써먹을 수 있겠다.", "오, 새 자료 냄새가 난다.", "연결고리를 또 하나 찾았어!"],
    en: ["Oh, this piece links to that one.", "This one could be useful in real life.", "I smell fresh material.", "Found another connection!"],
  },
  // Foreman Momo — simple Narrative Core foreman; recall and revisit.
  momo: {
    ko: ["작년 오늘은 뭘 적었더라.", "여기, 로그로 묶어둘게요.", "먼지 한 톨 없이 정리 완료.", "다 제자리에 있네, 좋아."],
    en: ["What did I write a year ago today?", "Here, I'll bundle this as a log.", "Filed away, not a speck of dust.", "Everything in its place. Good."],
  },
  // 벨라 — playful dream-weaver of imagination; ideas into scenes.
  vela: {
    ko: ["이걸 장면으로 펼치면 어떨까.", "만약에… 만약에 말이야.", "여기서 이야기가 시작될 것 같은데.", "상상은 공짜니까, 크게 가자."],
    en: ["What if I unfolded this into a scene?", "What if... just what if.", "A story could start right here.", "Dreaming's free, so let's dream big."],
  },
  // Lumina — Muse Core curator; notices taste and inspiration patterns.
  lumi: {
    ko: ["요즘 자꾸 이런 게 눈에 들어와.", "이 색깔, 마음에 든다.", "끌리는 데는 다 이유가 있지.", "취향도 훈련하면 더 선명해져."],
    en: ["This keeps catching my eye lately.", "I like this color.", "There's always a reason we're drawn in.", "Taste gets clearer when you train it."],
  },
};

/** Every self-talk line for a worker in the given locale (falls back to 세컨비). */
export function monologuesFor(id: WorkerId, locale: "en" | "ko"): readonly string[] {
  return (MONOLOGUES[id] ?? MONOLOGUES.secondb)[locale];
}

/** Pick one self-talk line. `r` is a 0..1 fraction (e.g. Math.random()); pure so
 *  the index math is testable. Returns "" only if a worker had no lines. */
export function pickMonologue(id: WorkerId, locale: "en" | "ko", r: number): string {
  const lines = monologuesFor(id, locale);
  if (lines.length === 0) return "";
  const frac = Number.isFinite(r) ? ((r % 1) + 1) % 1 : 0;
  return lines[Math.min(lines.length - 1, Math.floor(frac * lines.length))];
}

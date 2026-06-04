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
  // 아콘 (Archon) — Growth Core career consultant; big goals into one next step.
  archi: {
    ko: ["이번 일은 셋으로 쪼개면 되겠다.", "한 걸음, 또 한 걸음.", "큰 산도 결국 작은 계단이지.", "오늘 할 한 가지만 정하자."],
    en: ["Split this into three and it's doable.", "One step, then another.", "Even a mountain is just small stairs.", "Pick the one thing for today."],
  },
  // 릴리아 (Relia) — Bond Core warm guide; gentle, attentive.
  gadi: {
    ko: ["그 사람, 잘 지내려나.", "오늘은 마음이 좀 말랑한 날이네.", "연락 한번 해 볼까.", "고마웠다고 말할걸 그랬나."],
    en: ["I wonder how they're doing.", "A soft-hearted kind of day.", "Maybe I'll reach out.", "I should've said thank you."],
  },
  // 루멘 (Lumen) — Wisdom Core sage; connects knowledge to life.
  lulu: {
    ko: ["어, 이 조각이랑 저 조각이 이어지는데?", "이건 따로 모아 둬야지.", "오, 새 자료 냄새가 난다.", "연결고리를 또 하나 찾았어!"],
    en: ["Oh, this piece links to that one.", "Better file this one away.", "I smell fresh material.", "Found another connection!"],
  },
  // 모모 반장 (Foreman Momo) — Narrative Core crew foreman; sort + retrieve.
  momo: {
    ko: ["작년 오늘은 뭘 적었더라.", "여기, 잘 보관해 둘게요.", "먼지 한 톨 없이 정리 완료.", "다 제자리에 있네, 좋아."],
    en: ["What did I write a year ago today?", "Here, I'll keep this safe.", "Filed away, not a speck of dust.", "Everything in its place. Good."],
  },
  // 루미나 (Lumina) — Muse Core trainer & curator; notices patterns.
  lumi: {
    ko: ["요즘 자꾸 이런 게 눈에 들어와.", "이 색깔, 마음에 든다.", "끌리는 데는 다 이유가 있지.", "어, 이거 완전 취향 저격인데."],
    en: ["This keeps catching my eye lately.", "I like this color.", "There's always a reason we're drawn in.", "Oh, this is exactly my taste."],
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

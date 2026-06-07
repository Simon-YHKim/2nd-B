// Per-character self-talk (혼잣말) for the speech bubble shown when a worker is
// tapped on the main graph (2026-06-01 user directive). Each line fits that
// character's personality — see personas.ts — and is SELF-TALK muttered while
// they work the village, not a message addressed to the user. Pure data + a
// tested picker so the lines stay a single source of truth. Project register
// only: no clinical / technical terms (see src/lib/safety/lexicon.ts).

import type { WorkerId } from "@/components/art/WorkerSprite";

const MONOLOGUES: Record<WorkerId, { en: readonly string[]; ko: readonly string[] }> = {
  // 세컨비 - central AI for Soul Core, spanning Analytic and Divergent modes.
  secondb: {
    ko: ["패턴은 또렷하게, 가능성은 넓게.", "중심에서 한 번 더 연결해 보자.", "이 길은 Analytic, 저 길은 Divergent.", "흩어진 조각들이 한 화면에 모이고 있어."],
    en: ["Clear patterns first, wider possibilities next.", "Let me connect it once more from the center.", "This path is Analytic; that one is Divergent.", "The scattered pieces are gathering into one view."],
  },
  // 아콘 (Archon) - Growth Core career consultant; situation-matched growth.
  archi: {
    ko: ["성장 방향은 지금 상황에서 시작하지.", "커리어 단서부터 다시 재보자.", "다음 단계가 너무 크면 더 작게 나누면 돼.", "이번 패턴은 실전 계획으로 묶이겠어."],
    en: ["Growth direction starts with the current situation.", "Measure the career clues again.", "If the next step is too large, split it smaller.", "This pattern can become a working plan."],
  },
  // 릴리아 (Relia) - Bond Core warm guide; relationships and inner-world cues.
  gadi: {
    ko: ["관계의 온도를 천천히 읽어 보자.", "말 사이에 남은 마음도 봐야지.", "사람은 방향보다 리듬이 먼저일 때가 있어.", "조금 더 편안한 연결을 찾아볼까."],
    en: ["Read the temperature of this bond slowly.", "Notice what was left between the words.", "Sometimes people need rhythm before direction.", "Look for a steadier connection."],
  },
  // 루멘 (Lumen) - Wisdom Core sage; knowledge applied to life.
  lulu: {
    ko: ["지식은 삶에 닿을 때 빛나지.", "이 질문은 한 번 더 물어볼 만해.", "저장한 조각들이 작은 지혜로 모이고 있어.", "소크라테스는 묻고, 공자는 실천을 보겠지."],
    en: ["Knowledge shines when it reaches life.", "This question is worth asking once more.", "The saved pieces are gathering into a small wisdom.", "Socrates would ask; Confucius would look for practice."],
  },
  // 모모 반장 (Foreman Momo) - Narrative Core archive foreman; sort + retrieve.
  momo: {
    ko: ["새 기록은 카테고리부터 붙이자.", "언제 무슨 일이 있었는지 찾기 쉽게.", "기록 보관소 동선은 오늘도 깔끔.", "작은 로그도 제자리에 있으면 이야기가 돼."],
    en: ["Start the new record with a category.", "Make it easy to find what happened when.", "The archive routes are tidy today.", "Even a small log becomes a story in the right place."],
  },
  // 루미나 (Lumina) - Muse Core trainer and curator; taste, inspiration, balance.
  lumi: {
    ko: ["취향도 운동처럼 조금씩 키워지지.", "이 추천은 생활 리듬에 맞을까.", "좋아하는 걸 건강하게 오래 즐기는 쪽으로.", "오늘의 영감은 어디서 반짝일까."],
    en: ["Taste grows little by little, like training.", "Would this recommendation fit the day's rhythm?", "Keep what feels good enjoyable and balanced.", "Where will today's inspiration spark?"],
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

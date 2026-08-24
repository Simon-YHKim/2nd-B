// 북두칠성 일곱 — **나를 알아가는 일곱 자리.** (Simon 결정 2026-08-24)
//
// ── 왜 갈아엎었나 ────────────────────────────────────────────────────────────
//
// 이 저장소에는 "일곱"이 **세 벌** 있었다:
//
//   ① 도메인 별   커리어·재정·성장·관계·건강·휴식(+담아내기)  — 홈에 보이던 것
//   ② 자기이해 별 지금의 나·회상·보여지는 나·리듬·…            — 북극성 밝기를 계산하던 축
//   ③ 렌즈        때·크기·복귀·묻기·담기·꺼내기·프로필         — ②를 대체하기로 한 것
//
// Simon 이 직접 겪었다: *"지금 렌즈가 맞는거야 별이 맞는거야? 기존에 있는 커리어,
// 성장 이런거는 뭐야?"* 만든 사람이 헷갈리면 쓰는 사람은 못 쓴다.
//
// 그래서 **일곱은 이제 한 벌이다.** 별 = 나를 알아가는 입력 자리. 그뿐이다.
//
// [Simon 결정 7] *"앞으로 별, 렌즈 이런거 구분하지 말고 기능을 통합하도록 하자."*
// 렌즈라는 말은 **사용자 앞에 나오지 않는다.** 렌즈가 하던 일(결정 필드를 사람에
// 맞게 굽히기)은 각 별의 기능 안으로 들어간다.
//
// ── 겹침을 막지 않는다 ──────────────────────────────────────────────────────
//
// [Simon 결정 1] *"30대든 20대든 10대든 얼마든지 직장 내용은 겹칠 수 있어. 단,
// '직장' 별이 아니라면 사용자의 개인적 경험에 집중하는 드릴다운을 하면 되지
// 않을까? 직장은 직장 관련 드릴다운을 하고."*
//
// 그래서 별을 재료로 가르지 않는다. **질문의 결로 가른다** — 같은 서른다섯 살
// 이야기라도 시기 별에서는 *그때 어떤 사람이었나*를 묻고, 직장 별에서는 *일하는
// 나*를 묻는다. 사용자는 "이걸 어디에 넣지"를 고민할 필요가 없다.
//
// ── 나이 경계에 대해 ─────────────────────────────────────────────────────────
//
// Simon 안은 영유아기(0~6) · 학창시절(7~18) · 20대 · 30대 이후였다. 그대로 두면
// **19세가 어느 칸에도 없다.** 학창시절을 7~19 로 잡아 닫았다 — 한국에서 19세는
// 고3·재수·대학 1학년이라 학창시절 쪽이 자연스럽다. 20대는 20 부터다.

import type { LifePeriod } from "../interview/probe";

/** 홈 별자리의 일곱. 순서가 곧 화면 순서다. */
export type SevenStarId =
  | "profile" // 1 프로필 — 가입 정보·기본 개인정보
  | "infancy" // 2 영유아기 (0~6)
  | "school" // 3 학창시절 (7~19)
  | "twenties" // 4 20대 (20~29)
  | "later" // 5 30대 이후 (30~)
  | "work" // 6 직장 — 일하는 나 (시기와 무관하게 겹칠 수 있다)
  | "now"; // 7 지금 — 현재의 나

export const SEVEN_STAR_IDS: readonly SevenStarId[] = [
  "profile",
  "infancy",
  "school",
  "twenties",
  "later",
  "work",
  "now",
] as const;

export interface SevenStar {
  id: SevenStarId;
  /** 1~7. 화면·문서에서 부르는 번호. */
  index: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** i18n 키 접미사. `ds.star.<key>` 로 읽는다. */
  key: SevenStarId;
  /**
   * 이 별이 여는 인터뷰의 시기/주제. `null` 이면 인터뷰가 없는 별이다
   * (프로필 — 항목을 채우는 자리이지 대화하는 자리가 아니다).
   */
  period: LifePeriod | null;
  /**
   * 나이 경계. 시기 별에만 있다. `to: null` 은 위로 열려 있다는 뜻.
   * 주제 별(직장·지금)은 나이와 무관하므로 `null`.
   */
  ageBand: { from: number; to: number | null } | null;
}

export const SEVEN_STARS: readonly SevenStar[] = [
  { id: "profile", index: 1, key: "profile", period: null, ageBand: null },
  { id: "infancy", index: 2, key: "infancy", period: "infancy", ageBand: { from: 0, to: 6 } },
  { id: "school", index: 3, key: "school", period: "school", ageBand: { from: 7, to: 19 } },
  { id: "twenties", index: 4, key: "twenties", period: "twenties", ageBand: { from: 20, to: 29 } },
  { id: "later", index: 5, key: "later", period: "later", ageBand: { from: 30, to: null } },
  // 주제 별 둘. 나이 경계가 없고 **언제나 해당된다** -- 겹침을 막지 않기로 했으므로
  // 시기 별과 같은 재료를 다뤄도 된다. 다르게 만드는 것은 질문의 결이다.
  { id: "work", index: 6, key: "work", period: "work", ageBand: null },
  { id: "now", index: 7, key: "now", period: "now", ageBand: null },
];

const BY_ID = new Map(SEVEN_STARS.map((s) => [s.id, s]));

export function getSevenStar(id: SevenStarId): SevenStar {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`[seven-stars] unknown star: ${id}`);
  return s;
}

export function isSevenStarId(v: string): v is SevenStarId {
  return BY_ID.has(v as SevenStarId);
}

/** 이 별이 인터뷰를 여는가. 프로필만 아니다. */
export function hasInterview(id: SevenStarId): boolean {
  return getSevenStar(id).period !== null;
}

/**
 * 이 나이에 **아직 살지 않은** 별인가.
 *
 * 별자리는 일곱이 고정이라 칸을 없애지 않는다. 대신 스물다섯 살에게 "30대 이후"는
 * 아직 없는 시기이므로 **어둡게 두고 들어가지 못하게** 한다 — 살지 않은 시기를
 * 물어보는 것은 지어내라는 말이기 때문이다.
 *
 * 나이를 모르면 막지 않는다(막는 쪽이 더 나쁘다).
 */
export function isUnlived(id: SevenStarId, age: number | null): boolean {
  if (age === null || !Number.isFinite(age)) return false;
  const band = getSevenStar(id).ageBand;
  if (!band) return false;
  return age < band.from;
}

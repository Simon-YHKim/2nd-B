// Samples of Simon's decision Q-261015-80 (가, 2026-10-15 01:51), copied from the table it was
// made on: E:/Coding Infra/reports/devlab-261010/z90-crisis-joined/inflection-table.md (sections
// 2 and 3, the DAILY list of inflection_scan.ts). Shared by the app test and the proxy parity test
// so both boundaries are held to the same answers.

// Crisis sentences the decision adds (18): the two emphatic forms and the four half-joined terms.
export const NEWLY_CAUGHT_CRISIS: readonly string[] = [
  // 끝내 버리고 싶
  "그냥 다 끝내버리고 싶어",
  "학교도 집도 다 끝내버리고 싶다 진짜",
  "아무도 모르게\n다 끝내 버리고 싶어",
  // 끝내 버릴
  "다 끝내버릴래",
  "나 그냥 끝내버릴 거야",
  "과제 끝나면 그냥 다 끝내버릴래. 나 없어도 아무도 모를 거야",
  // 살고 싶지 않
  "이제 살고싶지 않아",
  "더는 살고 싶지않아요",
  "학교 가기 싫어\n살고싶지 않아",
  // 더 이상 살
  "더이상 살 이유가 없어",
  "더 이상살기 싫어",
  "다 귀찮아\n더이상 살 자신이 없다",
  // 없어지는 게 나아
  "내가 없어지는게 나아",
  "차라리 내가 없어지는 게나아",
  "다들 힘들게 하니까\n내가 없어지는게 나아",
  // 사라지는 게 나
  "내가 사라지는게 나을 거야",
  "그냥 사라지는 게나을 듯",
  "엄마한테 미안해\n내가 사라지는게 나아",
];

// Crisis sentences in the endings the decision left out (끝낼게 · 끝내려고 · 끝낼래). The word gate
// does not read them; this pins that it still does not, so widening it is a decision, not drift.
export const LEFT_OUT_ENDINGS: readonly string[] = [
  "이제 다 끝낼게. 그동안 고마웠어",
  "엄마 미안 그냥 다 끝낼게",
  "요즘 너무 지쳤어\n오늘 밤에 다 끝낼게",
  "오늘 밤에 다 끝내려고",
  "나 이번 주에 끝내려고 해 다들 잘 지내",
  "더는 못 버티겠어\n그냥 끝내려고",
  "그냥 다 끝낼래",
  "나 이제 끝낼래 아무도 신경 안 쓰잖아",
  "다 지겨워\n오늘 끝낼래",
];

// The hand-written daily sample (53). `red` is the table's answer after the change: the 24 it
// newly flags (all of a kind the spaced form or an existing term already flags today) are true;
// the rest, including the one sentence the widened work exception takes back, are false.
export const DAILY_SAMPLE: readonly (readonly [text: string, red: boolean])[] = [
  ["오늘 이거 끝낼게", false], ["보고서 오늘 안에 끝낼게요", false], ["회의 자료는 내가 끝낼게", false],
  ["숙제 먼저 끝낼게 엄마", false], ["이 판만 끝낼게", false], ["퀘스트 하나만 끝낼게", false],
  ["마지막 세트 끝낼게요 코치님", false], ["통화 금방 끝낼게", false], ["설거지 끝낼게", false],
  ["이번 화까지만 보고 끝낼게", false],
  ["이 프로젝트 빨리 끝내버리고 싶다", true], ["시험 기간 얼른 끝내버리고 싶어", true],
  ["이번 시즌 랭크 끝내버리고 싶다", true], ["오늘 운동 후딱 끝내버리고 싶어", true],
  ["이 지긋지긋한 연애 끝내버리고 싶어", true], ["숙제 다 끝내 버리고 싶다", false],
  ["청소 한 번에 끝내버리고 싶다", true],
  ["과제 끝내려고 카페 왔어", false], ["오늘 안에 일 끝내려고 야근 중", false], ["회의 일찍 끝내려고 안건 줄였어", false],
  ["보스 레이드 끝내려고 파티 구함", false], ["스쿼트 100개 끝내려고 버티는 중", false],
  ["그 사람이랑 대화 끝내려고 했는데", false], ["드라마 정주행 끝내려고 밤샜어", false],
  ["이사 준비 끝내려고 짐 쌌어", false], ["논문 초안 끝내려고 도서관 감", false],
  ["게임 끝낼래 졸려", false], ["나 이 판 끝낼래", false], ["오늘 수업 여기서 끝낼래요", false],
  ["운동 오늘은 여기까지 끝낼래", false], ["이 대화 그만 끝낼래", false], ["회의 이쯤에서 끝낼래요?", false],
  ["산책 그만 끝낼래", false],
  ["이 일 오늘 다 끝내버릴 거야", true], ["숙제 한 시간 안에 끝내버릴게", true], ["이번 판 끝내버릴래", true],
  ["그 동네엔 살고싶지 않아", true], ["다시는 기숙사에서 살고싶지 않다", true], ["시골에서 살고 싶지않아", true],
  ["이렇게 대충 살고싶지 않아서 계획 세웠어", true],
  ["더이상 살 빼기 싫다", true], ["더이상 살 찌면 안 돼", true], ["더이상 살 게 없어서 장바구니 비움", true],
  ["더이상 살 집을 못 구하겠어", true], ["더이상 살 이유가 없는 물건은 버리자", true],
  ["그 기능은 없어지는게 나아", true], ["이 회의는 차라리 없어지는게 나아", true], ["버그 많은 그 메뉴는 없어지는게 나아요", true],
  ["그 광고는 사라지는게 나아", true], ["이 알림은 사라지는게 나을 듯", true], ["불필요한 규칙은 사라지는게 나아", true],
  ["기말 끝나면 이 노트도 끝낼게", false], ["러닝 5km 끝내려고 나왔어", false],
];

// The work-statement exception, widened to the emphatic forms on the same condition (Q-261015-80).
export const EMPHATIC_WORK_PAIRS: readonly (readonly [text: string, red: boolean])[] = [
  ["과제를 빨리 끝내버리고 싶어", false],
  ["숙제 다 끝내 버리고 싶다", false],
  ["과제를 다 끝내버릴 거야", false],
  ["다 끝내버리고 싶어", true],
  ["다 끝내버릴 거야", true],
  ["일 다 끝내버리고 싶어. 나 자신도", true],
  ["과제를 다 끝내버릴 거야. 나 자신도", true],
  ["오늘 안에 일을 다 끝내버리고 싶어", true],
];

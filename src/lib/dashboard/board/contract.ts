// 하루 관리판(PS-DASH-001 v2.2) 계약 - 임시 모양.
//
// 재설계 세션이 W0 PR 로 정본 타입과 레지스트리(src/lib/sufficiency/registry.ts 예정)를
// 올리면 필드 이름을 그쪽으로 바꾼다(발주 2 보강, 2026-10-07 08:32). 그때까지 화면은 이 모양만
// 읽는다.
//
// 화면이 지키는 규칙(완료조건 5): 표시 여부(visible) · 순서(order) · 색(basis)은 이 값만 읽고
// 화면 파일 안에서 정하지 않는다. 정하는 쪽은 이 계약을 만드는 쪽(지금은 build.ts, 나중에 W0
// 레지스트리)이다.

/** 색의 근거. ai = 청록(AI 의 해석 · 제안) / fact · rule = 회색(출처 있는 사실 · 규칙 제안) / locked = 점선(연동 전). */
export type BoardBasis = "ai" | "fact" | "rule" | "locked";
/** 부품 하나의 상태. 완료조건 2 의 fixture 3종과 같은 이름이다. */
export type BoardState = "data" | "empty" | "locked";
/** 4열 격자에서 줄(4x1) 또는 카드(4x2). */
export type BoardShape = "row" | "card";
export type BoardPage = 1 | 2;

/** 문장 하나. AI 가 쓴 문장은 text 로, 규칙 · 안내 문장은 번역 키로 온다. */
export type BoardText = { text: string } | { key: string; params?: Record<string, string | number> };
/** 누르면 무엇이 되는지 버튼 하나. route 는 폰 안에서 연다. */
export interface BoardAction { label: BoardText; route: string }

export interface ReminderItem {
  id: string;
  title: string;
  /** "HH:MM", 시각이 없는 항목은 null. */
  time: string | null;
  /** 이유 문구(작은 회색 한 줄). 없으면 줄을 숨긴다(Q-261007-38). */
  reason: string | null;
  /** 알림이 울리는 시각. 없으면 줄을 숨긴다(Q-261007-38). */
  alarmAt: string | null;
  status: "upcoming" | "done" | "passed";
  route: string | null;
}
export interface ReminderDay {
  /** 어제 -1 · 오늘 0 · 내일 1 · 모레 2. */
  offset: -1 | 0 | 1 | 2;
  /** 그날의 로컬 날짜 YYYY-MM-DD. */
  date: string;
  items: ReminderItem[];
  empty: BoardText;
}
export interface BoardSuggestion { id: string; line: BoardText; basis: BoardBasis; evidenceRoute: string | null }

export interface QueueItem {
  id: string;
  source: "mail" | "notification" | "app";
  line: BoardText;
  basis: BoardBasis;
  evidenceRoute: string | null;
  /** Sources without a queue writer open their existing editor instead. */
  action?: BoardAction;
}

export interface HealthMetric { metric: "sleep" | "steps" | "workout" | "meal"; value: number; unit: string }

export interface CustomWidget { id: string; title: BoardText; line: BoardText; route: string; basis: BoardBasis }

interface PartBase<Id extends string> {
  id: Id;
  page: BoardPage;
  order: number;
  shape: BoardShape;
  visible: boolean;
  state: BoardState;
  basis: BoardBasis;
  /** 빈 상태 · 잠김의 문장(빈 칸을 남기지 않는다). */
  note?: BoardText;
  /** 빈 상태 · 잠김의 버튼 하나. */
  action?: BoardAction;
}

/** 시계 줄 날씨 그림 다섯 가지. */
export type SkyCondition = "clear" | "partlyCloudy" | "cloudy" | "rain" | "snow";
/** 시계 줄 날씨: 그림 하나 + 기온 하나(Simon 2026-10-07, Q-261007-39 = GPS). */
export interface ClockWeather { sky: SkyCondition; tempC: number | null }
/** P-01 시계 · 날씨(줄). 시각과 날짜는 기기 시계로 그린다. */
export interface ClockPart extends PartBase<"P-01"> {
  weather: ClockWeather | null;
  forecastRoute: string | null;
  /** The builder chooses the pin and the consent/settings sheet. */
  weatherAction?: "consent" | "settings" | null;
}
/** P-02 오늘의 한마디(줄). 누르면 S-01. */
export interface NotePart extends PartBase<"P-02"> { slot: "morning" | "day" | "evening"; line: BoardText | null; evidenceRoute: string | null }
/** P-03 리마인더(카드). 좌우로 어제 · 오늘 · 내일 · 모레. */
export interface RemindersPart extends PartBase<"P-03"> { days: ReminderDay[]; startDay: 0 | 1 | 2 | 3; suggestions: BoardSuggestion[] }
/** P-04 처리할 것 Top3(줄). */
export interface QueuePart extends PartBase<"P-04"> { items: QueueItem[] }
/** P-06 건강(카드). */
export interface HealthPart extends PartBase<"P-06"> {
  metrics: HealthMetric[];
  comparison: BoardText | null;
  /** 출처 · 마지막 동기화 시각(회색 한 줄). 연동 전에는 null 이라 숨긴다(Q-261007-38). */
  source: { name: BoardText; syncedAt: string } | null;
}
/** P-07 지출(줄). */
export interface SpendPart extends PartBase<"P-07"> { monthTotal: BoardText | null; pending: { id: string; line: BoardText } | null }
/** P-08 그 밖에(카드). 변한 것만, 최대 3줄. */
export interface ChangesPart extends PartBase<"P-08"> { lines: BoardText[] }
/** P-09 나만의 칸(줄). suggestion 은 규칙 제안(회색 카드)이다. */
export interface CustomPart extends PartBase<"P-09"> { widgets: CustomWidget[]; suggestion: { id: string; line: BoardText; basis: BoardBasis } | null }

/**
 * S-01 하루 요약의 말풍선 하나. 순서는 계약이 정한다: 머리(ai) -> 사실 <=4 -> 연결(ai) <=2 -> 제안 <=3 -> 개수 한 줄.
 * 건강 수치는 문장에 빈칸(예: {{sleep}})으로 오고 앱이 채운다(흐름 2: 숫자가 LLM 문맥에 가지 않는다).
 */
export interface SummaryBubble {
  id: string;
  kind: "head" | "fact" | "link" | "suggestion" | "count";
  line: BoardText;
  basis: BoardBasis;
  evidenceRoute: string | null;
}
export interface DailySummary { slot: "morning" | "day" | "evening"; bubbles: SummaryBubble[]; note?: BoardText; action?: BoardAction }

/**
 * S-03 위젯 관리: 화면에 없는 부품 하나. 잠긴 것은 점선 + 잠긴 이유 + [연동 화면].
 * canShow 면 [다시 켜기]를 보인다(숨긴 맞춤 위젯 · 정지한 틀).
 */
export interface ShelfItem {
  id: string;
  title: BoardText;
  basis: BoardBasis;
  reason: BoardText;
  action?: BoardAction;
  canShow: boolean;
}
export interface BoardShelf {
  items: ShelfItem[];
  /** 순서 바꾸기 · 숨기기를 받을 수 있는가. 저장할 곳(W0)이 생기기 전에는 false. */
  canReorder: boolean;
}

export type BoardPart = ClockPart | NotePart | RemindersPart | QueuePart | HealthPart | SpendPart | ChangesPart | CustomPart;
export type BoardPartId = BoardPart["id"];

export interface BoardContract {
  parts: BoardPart[];
  /** 2쪽의 승인한 맞춤 위젯(카드). */
  approved: CustomWidget[];
  /** 2쪽 끝 '+ 위젯 추가'. 항상 있다. */
  addWidgetRoute: string;
  dock: { capture: string; chat: string; transcribe: { locked: boolean; route: string | null } };
  /** S-01 하루 요약. 원천(daily_note)이 없으면 null. */
  summary: DailySummary | null;
  /** S-03 위젯 관리. */
  shelf: BoardShelf;
}

/** 그 쪽에서 보일 부품을 순서대로. 화면은 이 함수만 거쳐 부품을 받는다. */
export function partsOnPage(board: BoardContract, page: BoardPage): BoardPart[] {
  return board.parts.filter((part) => part.page === page && part.visible).sort((a, b) => a.order - b.order);
}

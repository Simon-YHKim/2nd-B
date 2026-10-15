// 하루 관리판 부품별 fixture 3종(데이터 있음 / 빈 상태 / 잠김). 완료조건 2.
//
// 설계도 PS-DASH-001 v2.2 의 예시 문구를 그대로 쓴다. 이 값은 테스트 전용이다 -
// 앱이 읽는 판은 build.ts(나중에 W0 레지스트리)가 만든다. 가짜 값이 사용자 화면에 나가지 않는다.

import type { BoardContract, BoardPart, BoardPartId, BoardState, DailySummary } from "../../board/contract";

const SETUP = { label: { key: "phone.board.health.openSetup" }, route: "/import?mode=account" };
const CAPTURE = { label: { key: "phone.board.custom.capture" }, route: "/capture" };

const DATA: Record<BoardPartId, BoardPart> = {
  "P-01": {
    id: "P-01", page: 1, order: 1, shape: "row", visible: true, state: "data", basis: "fact",
    weather: { sky: "clear", tempC: 18 }, forecastRoute: "/board/forecast",
  },
  "P-02": {
    id: "P-02", page: 1, order: 2, shape: "row", visible: true, state: "data", basis: "ai", slot: "morning",
    line: { text: "어제 미룬 보고서가 오늘 오전 회의 전에 필요해 보여요." }, evidenceRoute: "/record/rec-1",
  },
  "P-03": {
    id: "P-03", page: 1, order: 3, shape: "card", visible: true, state: "data", basis: "fact", startDay: 1,
    days: [
      { offset: -1, date: "2026-10-06", empty: { key: "phone.board.reminders.empty.yesterday" }, items: [
        { id: "r-0", title: "물 2L", time: null, reason: null, alarmAt: null, status: "passed", route: "/star/health" },
      ] },
      { offset: 0, date: "2026-10-07", empty: { key: "phone.board.reminders.empty.today" }, items: [
        { id: "r-1", title: "아침 걷기", time: "07:30", reason: "지난주 걸음이 평소보다 적었습니다", alarmAt: "07:20", status: "done", route: "/star/health" },
        { id: "r-2", title: "주간 보고", time: "10:00", reason: null, alarmAt: "09:50", status: "upcoming", route: "/ops" },
      ] },
      { offset: 1, date: "2026-10-08", empty: { key: "phone.board.reminders.empty.tomorrow" }, items: [] },
      { offset: 2, date: "2026-10-09", empty: { key: "phone.board.reminders.empty.dayAfter" }, items: [
        { id: "r-3", title: "엄마 생신 D-1", time: null, reason: "작년에 선물을 하루 늦게 보냈습니다", alarmAt: null, status: "upcoming", route: "/reminders" },
      ] },
    ],
    suggestions: [{ id: "s-1", line: { text: "저녁 스트레칭 10분을 넣어 볼까요?" }, basis: "ai", evidenceRoute: "/record/rec-2" }],
  },
  "P-04": {
    id: "P-04", page: 1, order: 4, shape: "row", visible: true, state: "data", basis: "ai",
    items: [
      { id: "q-1", source: "mail", line: { text: "김 책임이 금요일까지 견적 회신을 기다리고 있어요" }, basis: "ai", evidenceRoute: "/record/mail-1" },
      { id: "q-2", source: "app", line: { text: "독서 기록 3일째 비어 있음" }, basis: "fact", evidenceRoute: null },
      { id: "q-3", source: "notification", line: { text: "택배 도착 · 문 앞" }, basis: "fact", evidenceRoute: null },
    ],
  },
  "P-06": {
    id: "P-06", page: 2, order: 1, shape: "card", visible: true, state: "data", basis: "rule",
    metrics: [
      { metric: "sleep", value: 380, unit: "min" },
      { metric: "steps", value: 6120, unit: "count" },
      { metric: "workout", value: 25, unit: "min" },
    ],
    comparison: { text: "평소보다 40분 짧아요" },
    source: { name: { key: "phone.board.health.sources.health_connect" }, syncedAt: "2026-10-07T07:10:00+09:00" },
  },
  "P-07": {
    id: "P-07", page: 2, order: 2, shape: "row", visible: true, state: "data", basis: "rule",
    monthTotal: { text: "이번 달 412,300원" }, pending: { id: "l-1", line: { text: "편의점 4,800원 · 어제 21:14" } },
  },
  "P-08": {
    id: "P-08", page: 2, order: 3, shape: "card", visible: true, state: "data", basis: "fact",
    lines: [{ text: "읽던 책 진도가 이번 주 2장 늘었습니다" }, { text: "새 연락처 1명 · 박 매니저" }],
  },
  "P-09": {
    id: "P-09", page: 1, order: 5, shape: "row", visible: true, state: "data", basis: "fact",
    widgets: [
      { id: "w-1", title: { text: "김 책임" }, line: { text: "최근 연락 3일 전 · 견적 대기" }, route: "/wiki/page/kim", basis: "fact" },
      { id: "w-2", title: { text: "아침 걷기" }, line: { text: "이번 주 4/5" }, route: "/reminders", basis: "fact" },
    ],
    suggestion: { id: "c-1", line: { text: "김 책임 위젯을 만들까요? 최근 2주 기록 9건에 나왔습니다" }, basis: "rule" },
  },
};

/** 빈 상태: 문장으로 말한다. 표시 조건이 아예 맞지 않는 부품(P-08)은 숨긴다. */
const EMPTY: Record<BoardPartId, BoardPart> = {
  "P-01": { ...(DATA["P-01"] as Extract<BoardPart, { id: "P-01" }>), state: "empty", weather: null, forecastRoute: null,
    note: { key: "phone.board.clock.weatherPrompt" }, action: { label: { key: "phone.board.clock.pickArea" }, route: "/profile-details" } },
  "P-02": { ...(DATA["P-02"] as Extract<BoardPart, { id: "P-02" }>), state: "empty", basis: "fact", line: null, evidenceRoute: null,
    note: { key: "phone.board.note.empty" } },
  "P-03": { ...(DATA["P-03"] as Extract<BoardPart, { id: "P-03" }>), state: "empty", suggestions: [],
    days: (DATA["P-03"] as Extract<BoardPart, { id: "P-03" }>).days.map((day) => ({ ...day, items: [] })) },
  "P-04": { ...(DATA["P-04"] as Extract<BoardPart, { id: "P-04" }>), state: "empty", basis: "fact", items: [],
    note: { key: "phone.board.queue.empty" } },
  "P-06": { ...(DATA["P-06"] as Extract<BoardPart, { id: "P-06" }>), state: "empty", basis: "fact", metrics: [], comparison: null, source: null,
    note: { key: "phone.board.health.empty" }, action: SETUP },
  "P-07": { ...(DATA["P-07"] as Extract<BoardPart, { id: "P-07" }>), state: "empty", basis: "fact", monthTotal: null, pending: null,
    note: { key: "phone.board.spend.empty" }, action: { label: { key: "phone.board.spend.open" }, route: "/ledger" } },
  "P-08": { ...(DATA["P-08"] as Extract<BoardPart, { id: "P-08" }>), state: "empty", visible: false, lines: [] },
  "P-09": { ...(DATA["P-09"] as Extract<BoardPart, { id: "P-09" }>), state: "empty", widgets: [], suggestion: null,
    note: { key: "phone.board.custom.empty" }, action: CAPTURE },
};

/** 잠김: 점선 + 잠긴 이유 + [연동 화면]. */
function locked(part: BoardPart, reason: string, route: string): BoardPart {
  return { ...EMPTY[part.id], state: "locked", basis: "locked", visible: true,
    note: { key: `phone.board.locked.${reason}` }, action: { label: { key: "phone.board.locked.open" }, route } };
}
const LOCKED: Record<BoardPartId, BoardPart> = {
  "P-01": locked(DATA["P-01"], "weather", "/profile-details"),
  "P-02": locked(DATA["P-02"], "aiConsent", "/settings"),
  "P-03": locked(DATA["P-03"], "calendar", "/import-hub"),
  "P-04": locked(DATA["P-04"], "inbox", "/data-connections"),
  "P-06": { ...EMPTY["P-06"], state: "locked", basis: "locked", note: { key: "phone.board.health.locked" }, action: SETUP },
  "P-07": locked(DATA["P-07"], "ledger", "/import-hub"),
  "P-08": locked(DATA["P-08"], "sources", "/data-connections"),
  "P-09": locked(DATA["P-09"], "records", "/capture"),
};

export const PART_FIXTURES: Record<BoardPartId, Record<BoardState, BoardPart>> = Object.fromEntries(
  (Object.keys(DATA) as BoardPartId[]).map((id) => [id, { data: DATA[id], empty: EMPTY[id], locked: LOCKED[id] }]),
) as Record<BoardPartId, Record<BoardState, BoardPart>>;

/** 모든 부품이 같은 상태인 판 하나. */
export function boardFixture(state: BoardState): BoardContract {
  return {
    parts: (Object.keys(PART_FIXTURES) as BoardPartId[]).map((id) => PART_FIXTURES[id][state]),
    approved: state === "data" ? [{ id: "a-1", title: { text: "독서" }, line: { text: "이번 달 2권째 · 143쪽" }, route: "/reading", basis: "fact" }] : [],
    addWidgetRoute: "/board/widgets",
    dock: { capture: "/capture", chat: "/secondb", transcribe: { locked: true, route: null } },
    summary: state === "data" ? SUMMARY : null,
    shelf: SHELF,
  };
}

/** S-03: 잠긴 부품(연동 화면) · 숨긴 맞춤 위젯(다시 켜기). */
export const SHELF: BoardContract["shelf"] = {
  canReorder: true,
  items: [
    { id: "P-04", title: { key: "phone.board.shelf.parts.queue" }, basis: "locked", reason: { key: "phone.board.locked.inbox" },
      action: { label: { key: "phone.board.locked.open" }, route: "/data-connections" }, canShow: false },
    { id: "w-3", title: { text: "박 매니저" }, basis: "fact", reason: { key: "phone.board.shelf.reasons.hidden" }, canShow: true },
  ],
};

/** S-01 아침 요약. 머리 -> 사실 4 -> 연결 2 -> 제안 3(AI 2 · 규칙 1) -> 개수 한 줄. */
export const SUMMARY: DailySummary = {
  slot: "morning",
  bubbles: [
    { id: "h", kind: "head", line: { text: "오늘은 오전에 몰린 날이에요." }, basis: "ai", evidenceRoute: null },
    { id: "f1", kind: "fact", line: { text: "어젯밤 수면 {{sleep}}" }, basis: "fact", evidenceRoute: null },
    { id: "f2", kind: "fact", line: { text: "10:00 주간 보고" }, basis: "fact", evidenceRoute: "/reminders" },
    { id: "f3", kind: "fact", line: { text: "김 책임 견적 회신 대기 · 금요일까지" }, basis: "fact", evidenceRoute: "/record/mail-1" },
    { id: "f4", kind: "fact", line: { text: "어제 걸음 {{steps}}" }, basis: "fact", evidenceRoute: null },
    { id: "l1", kind: "link", line: { text: "보고 전에 견적 회신을 먼저 보내면 오후가 비어요." }, basis: "ai", evidenceRoute: "/record/rec-1" },
    { id: "l2", kind: "link", line: { text: "수면이 짧은 날은 오후 집중이 떨어졌어요." }, basis: "ai", evidenceRoute: "/record/rec-3" },
    { id: "s1", kind: "suggestion", line: { text: "점심 뒤 20분 걷기" }, basis: "ai", evidenceRoute: null },
    { id: "s2", kind: "suggestion", line: { text: "견적 회신 초안 먼저 쓰기" }, basis: "ai", evidenceRoute: null },
    { id: "s3", kind: "suggestion", line: { text: "23:00 전에 눕기 · 이번 주 규칙" }, basis: "rule", evidenceRoute: null },
    { id: "c", kind: "count", line: { text: "일정 2 · 처리할 것 3 · 리마인더 4" }, basis: "fact", evidenceRoute: null },
  ],
};

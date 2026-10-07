// 하루 관리판(PS-DASH-001 v2.2) 계약 · 임시 빌더 · 색 규칙. 발주 2 완료조건 1 · 2 · 3 과 08:32 보강.
//
// 이 저장소는 컴포넌트를 마운트하는 렌더 테스트가 막혀 있다(RN 0.85). 그래서 '스냅숏' 은 화면이
// 그리는 계약 값(쪽별 부품 순서 · 상태 · 줄)의 스냅숏으로 대신하고, 화면 쪽은
// board-screen-contract.test.ts 가 소스로 지킨다.

import { buildBoard } from "../board/build";
import { partsOnPage, type BoardPart, type BoardState } from "../board/contract";
import { boardTone } from "../board/tone";
import type { DashboardData } from "../model";
import { m3, m3Accent } from "../../theme/m3";
import { boardFixture, PART_FIXTURES } from "./fixtures/board-fixtures";

const NOW = new Date(2026, 9, 7, 8, 0, 0); // 2026-10-07 (수) 08:00 로컬

function data(over: Partial<DashboardData> = {}): DashboardData {
  return {
    ownerId: "u1", readAt: NOW.toISOString(),
    records: { ok: true, value: [] }, interviews: { ok: true, value: [] },
    routines: { ok: true, value: [] }, completions: { ok: true, value: [] },
    imports: { ok: true, value: [] }, health: { ok: true, value: [] }, healthEnabled: false,
    notifications: { ok: true, value: { permission: "denied", scheduled: 0 } },
    ...over,
  };
}

function routine(id: string, over: Record<string, unknown> = {}) {
  return {
    id, user_id: "u1", domain_id: "health_routine", title: `t-${id}`, reason: null, recurrence: "daily" as const,
    reminder_time: "07:30", weekday: null, duration_minutes: null, checklist: [], active: true, created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function sample(over: Record<string, unknown> = {}) {
  return {
    id: "h1", user_id: "u1", source: "health_connect", metric_type: "steps", value: 6120, unit: "count",
    started_at: "2026-10-06T00:00:00Z", ended_at: null, external_id: null, metadata: {}, created_at: "2026-10-06T22:10:00Z",
    ...over,
  };
}

/** 보이는 부품은 빈 칸이면 안 된다: 문장이든 내용이든 하나는 있다. */
function hasContent(part: BoardPart): boolean {
  if (part.note) return true;
  switch (part.id) {
    case "P-01": return true; // 시계는 늘 그린다.
    case "P-02": return part.line !== null;
    case "P-03": return part.days.length === 4 && part.days.every((day) => day.items.length > 0 || "key" in day.empty || "text" in day.empty);
    case "P-04": return part.items.length > 0;
    case "P-06": return part.metrics.length > 0;
    case "P-07": return part.monthTotal !== null || part.pending !== null;
    case "P-08": return part.lines.length > 0;
    case "P-09": return part.widgets.length > 0 || part.suggestion !== null;
  }
}

describe("완료조건 1: 1쪽 · 2쪽 · 독 배치", () => {
  test("데이터가 있는 판의 쪽별 부품 순서", () => {
    const board = boardFixture("data");
    expect(partsOnPage(board, 1).map((part) => `${part.id}:${part.shape}`)).toEqual(["P-01:row", "P-02:row", "P-03:card", "P-04:row", "P-09:row"]);
    expect(partsOnPage(board, 2).map((part) => `${part.id}:${part.shape}`)).toEqual(["P-06:card", "P-07:row", "P-08:card"]);
    expect(board.approved.map((widget) => widget.id)).toEqual(["a-1"]);
    expect(board.addWidgetRoute).toBe("/board/widgets");
    expect(board.dock).toEqual({ capture: "/capture", chat: "/secondb", transcribe: { locked: true, route: null } });
  });

  test("지금 앱이 그리는 판(원천이 없는 부품은 숨김)", () => {
    const board = buildBoard(data({ routines: { ok: true, value: [routine("r1")] } }), NOW, false);
    expect(partsOnPage(board, 1).map((part) => `${part.id}:${part.state}`)).toEqual(["P-01:data", "P-03:data", "P-09:empty"]);
    expect(partsOnPage(board, 2).map((part) => `${part.id}:${part.state}`)).toEqual(["P-06:locked"]);
    // '+ 위젯 추가' 는 쪽의 부품 목록과 따로, 늘 있다.
    expect(board.addWidgetRoute).toBe("/board/widgets");
    expect(board.dock.transcribe.locked).toBe(true);
  });

  test("읽기 전(데이터 없음)에도 빈 칸 없이 시계와 나만의 칸만", () => {
    const board = buildBoard(null, NOW, null);
    expect(partsOnPage(board, 1).map((part) => part.id)).toEqual(["P-01", "P-09"]);
    expect(partsOnPage(board, 2)).toEqual([]);
  });
});

describe("완료조건 2: 부품마다 fixture 3종, 빈 칸 0", () => {
  const states: BoardState[] = ["data", "empty", "locked"];
  for (const id of Object.keys(PART_FIXTURES) as (keyof typeof PART_FIXTURES)[]) {
    for (const state of states) {
      test(`${id} ${state}`, () => {
        const part = PART_FIXTURES[id][state];
        expect(part.id).toBe(id);
        expect(part.state).toBe(state);
        // 보이는 부품은 빈 칸이 아니다. 숨김은 '변한 것이 없을 때의 그 밖에' 하나뿐이다.
        if (part.visible) expect(hasContent(part)).toBe(true);
        else expect(`${id}:${state}`).toBe("P-08:empty");
        if (state === "locked") {
          expect(part.basis).toBe("locked");
          expect(part.action?.route).toBeTruthy();
        }
      });
    }
  }

  test("지금 앱이 만드는 판도 보이는 부품은 빈 칸이 아니다", () => {
    for (const board of [
      buildBoard(null, NOW, null),
      buildBoard(data(), NOW, false),
      buildBoard(data({ routines: { ok: true, value: [routine("r1", { reason: "x" })] }, healthEnabled: true, health: { ok: true, value: [sample()] } }), NOW, false),
    ]) {
      for (const part of board.parts.filter((item) => item.visible)) expect(hasContent(part)).toBe(true);
    }
  });
});

describe("완료조건 3: basis 별 색", () => {
  test("ai = 청록 · fact · rule = 회색 · locked = 점선", () => {
    expect(boardTone("ai")).toEqual({ text: m3Accent.skyText, border: m3Accent.skyText, borderStyle: "solid" });
    expect(boardTone("fact")).toEqual({ text: m3.color.onSurfaceVariant, border: m3.color.outline, borderStyle: "solid" });
    expect(boardTone("rule")).toEqual(boardTone("fact"));
    expect(boardTone("locked")).toEqual({ text: m3.color.onSurfaceVariant, border: m3.color.outline, borderStyle: "dashed" });
  });

  test("흐름 2: 건강 수치 · 지출 금액의 문장은 규칙 문장(회색)이다", () => {
    for (const state of ["data", "empty"] as const) {
      expect(["fact", "rule"]).toContain(PART_FIXTURES["P-06"][state].basis);
      expect(["fact", "rule"]).toContain(PART_FIXTURES["P-07"][state].basis);
    }
  });
});

describe("Q-261007-38: P-03 이유 문구 · 알림 시각, P-06 출처 줄", () => {
  test("P-03: 이유와 알림 시각이 있으면 싣고, 없으면 null 이라 줄이 숨는다", () => {
    const routines = [routine("r1", { reason: "지난주 걸음이 적었습니다" }), routine("r2", { reminder_time: null })];
    const on = buildBoard(data({ routines: { ok: true, value: routines }, notifications: { ok: true, value: { permission: "granted", scheduled: 2 } } }), NOW, false);
    const today = (on.parts.find((part) => part.id === "P-03") as Extract<BoardPart, { id: "P-03" }>).days.find((day) => day.offset === 0)!;
    expect(today.items.map((item) => [item.id, item.reason, item.alarmAt])).toEqual([["r1", "지난주 걸음이 적었습니다", "07:30"], ["r2", null, null]]);

    const off = buildBoard(data({ routines: { ok: true, value: routines } }), NOW, false);
    const todayOff = (off.parts.find((part) => part.id === "P-03") as Extract<BoardPart, { id: "P-03" }>).days.find((day) => day.offset === 0)!;
    expect(todayOff.items.map((item) => item.alarmAt)).toEqual([null, null]);
  });

  test("P-03: 어제 · 오늘 · 내일 · 모레 네 날, 어제 안 한 것은 넘어간 것", () => {
    const board = buildBoard(data({
      routines: { ok: true, value: [routine("r1")] },
      completions: { ok: true, value: [{ id: "l1", routine_id: "r1", user_id: "u1", completed_on: "2026-10-07", created_at: "2026-10-07T00:00:00Z" }] },
    }), NOW, false);
    const part = board.parts.find((item) => item.id === "P-03") as Extract<BoardPart, { id: "P-03" }>;
    expect(part.days.map((day) => `${day.offset}:${day.date}:${day.items.map((item) => item.status).join(",")}`))
      .toEqual(["-1:2026-10-06:passed", "0:2026-10-07:done", "1:2026-10-08:upcoming", "2:2026-10-09:upcoming"]);
    expect(part.startDay).toBe(1);
  });

  test("P-06: 출처 줄은 연동 뒤에만, 연동 전에는 숨는다(null)", () => {
    const before = buildBoard(data({ healthEnabled: false }), NOW, false).parts.find((part) => part.id === "P-06") as Extract<BoardPart, { id: "P-06" }>;
    expect([before.visible, before.state, before.source]).toEqual([true, "locked", null]);

    const after = buildBoard(data({ healthEnabled: true, health: { ok: true, value: [
      sample({ id: "a", created_at: "2026-10-06T22:10:00Z" }),
      sample({ id: "b", metric_type: "sleep", value: 380, unit: "min", created_at: "2026-10-06T22:05:00Z" }),
    ] } }), NOW, false).parts.find((part) => part.id === "P-06") as Extract<BoardPart, { id: "P-06" }>;
    expect(after.state).toBe("data");
    expect(after.metrics.map((metric) => metric.metric)).toEqual(["sleep", "steps"]);
    expect(after.source).toEqual({ name: { key: "phone.board.health.sources.health_connect" }, syncedAt: "2026-10-06T22:10:00Z" });
  });

  test("P-06: 미성년 · 나이 모름에게는 건강 부품을 보이지 않는다", () => {
    for (const minor of [true, null]) {
      const part = buildBoard(data({ healthEnabled: true, health: { ok: true, value: [sample()] } }), NOW, minor).parts.find((item) => item.id === "P-06")!;
      expect(part.visible).toBe(false);
    }
  });
});

// 지금 읽고 있는 데이터(loadDashboard)로 하루 관리판 계약을 만든다 - 임시.
//
// W0 레지스트리가 오면 이 파일이 그쪽으로 넘어간다(표시 문턱 = B2 문턱 표). 그때까지는 이미
// 읽는 것만 쓴다: 루틴(P-03), 건강 기록(P-06). 원천이 아직 없는 부품(P-02 한마디 · P-04 처리할 것
// · P-07 지출 · P-08 그 밖에)은 숨긴다 - 빈 칸으로 두지 않고, 사실과 다른 '없어요' 를 쓰지 않는다
// (Simon 2026-10-07 "지금 바로 교체").
//
// 흐름 2(RD-261007-09 A): 건강 수치는 이 화면에만 나온다. 여기서 만든 값은 LLM 문맥으로 가지 않는다.

import type { HealthSampleRow } from "../../supabase/health";
import { localDate, realHealthSamples, routineActionRoute, todayAgenda, type DashboardData } from "../model";
import type { BoardContract, BoardPart, HealthMetric, ReminderDay, ReminderItem } from "./contract";

const DAY_OFFSETS = [-1, 0, 1, 2] as const;
const EMPTY_DAY_KEY = { [-1]: "yesterday", 0: "today", 1: "tomorrow", 2: "dayAfter" } as const;
const HEALTH_METRICS = ["sleep", "steps", "workout"] as const;
/** 기기 연동으로 들어온 기록만 출처로 이름을 붙인다. */
const SYNC_SOURCES = new Set(["health_connect", "healthkit"]);

function addDays(now: Date, days: number): Date {
  const date = new Date(now);
  date.setDate(now.getDate() + days);
  return date;
}

function reminderDays(data: DashboardData, now: Date): ReminderDay[] {
  const routines = data.routines.ok ? data.routines.value : [];
  const logs = data.completions.ok ? data.completions.value : [];
  // 알림이 실제로 잡혀 있을 때만 알림 시각을 보인다(권한 허용 + 예약 1건 이상).
  const alarmsOn = data.notifications.ok && data.notifications.value.permission === "granted" && data.notifications.value.scheduled > 0;
  return DAY_OFFSETS.map((offset) => {
    const date = addDays(now, offset);
    const items: ReminderItem[] = todayAgenda(routines, logs, date).map((routine) => ({
      id: routine.id,
      title: routine.title,
      time: routine.reminder_time?.slice(0, 5) ?? null,
      reason: routine.reason?.trim() || null,
      alarmAt: alarmsOn && offset >= 0 ? routine.reminder_time?.slice(0, 5) ?? null : null,
      status: routine.completed ? "done" : offset < 0 ? "passed" : "upcoming",
      route: routineActionRoute(routine.domain_id),
    }));
    return { offset, date: localDate(date), items, empty: { key: `phone.board.reminders.empty.${EMPTY_DAY_KEY[offset]}` } };
  });
}

function latestByMetric(samples: readonly HealthSampleRow[]): HealthMetric[] {
  const metrics: HealthMetric[] = [];
  for (const metric of HEALTH_METRICS) {
    const sample = samples.find((row) => row.metric_type === metric);
    if (sample) metrics.push({ metric, value: Math.round(sample.value), unit: sample.unit });
  }
  return metrics;
}

function healthPart(data: DashboardData, isMinor: boolean | null): BoardPart {
  const base = { id: "P-06" as const, page: 2 as const, order: 1, shape: "card" as const, metrics: [], comparison: null, source: null };
  const setup = { label: { key: "phone.board.health.openSetup" }, route: "/import?mode=account" };
  // 건강 연동은 성인만(F4 결정 전까지). 미성년 · 나이 모름에게는 부품을 숨긴다.
  if (isMinor !== false || !data.health.ok) return { ...base, visible: false, state: "locked", basis: "locked" };
  if (!data.healthEnabled) {
    return { ...base, visible: true, state: "locked", basis: "locked", note: { key: "phone.board.health.locked" }, action: setup };
  }
  const samples = realHealthSamples(data.health.value);
  const metrics = latestByMetric(samples);
  if (!metrics.length) {
    return { ...base, visible: true, state: "empty", basis: "fact", note: { key: "phone.board.health.empty" }, action: setup };
  }
  const synced = samples.filter((row) => SYNC_SOURCES.has(row.source))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return {
    ...base, visible: true, state: "data", basis: "fact", metrics,
    source: synced ? { name: { key: `phone.board.health.sources.${synced.source}` }, syncedAt: synced.created_at } : null,
  };
}

/** 원천이 아직 없는 부품: 숨긴다. W0 가 원천을 붙이면 여기서 빠진다. */
function hidden<T extends BoardPart["id"]>(id: T, page: 1 | 2, order: number, shape: "row" | "card") {
  return { id, page, order, shape, visible: false, state: "locked" as const, basis: "locked" as const };
}

const PART_TITLE: Record<BoardPart["id"], string> = {
  "P-01": "clock", "P-02": "note", "P-03": "reminders", "P-04": "queue", "P-06": "health", "P-07": "spend", "P-08": "changes", "P-09": "custom",
};

/** 화면에 없는 부품과 그 이유. 원천이 아직 없는 것은 '준비 중', 건강은 미성년이면 '성인만'. */
function shelfItems(parts: BoardPart[], isMinor: boolean | null) {
  return parts.filter((part) => !part.visible).map((part) => ({
    id: part.id,
    title: { key: `phone.board.shelf.parts.${PART_TITLE[part.id]}` },
    basis: "locked" as const,
    reason: { key: part.id === "P-06" && isMinor !== false ? "phone.board.shelf.reasons.adultOnly" : "phone.board.shelf.reasons.preparing" },
    canShow: false,
  }));
}

export function buildBoard(data: DashboardData | null, now: Date, isMinor: boolean | null): BoardContract {
  const parts: BoardPart[] = [
    { id: "P-01", page: 1, order: 1, shape: "row", visible: true, state: "data", basis: "fact", weather: null, forecastRoute: null },
    { ...hidden("P-02", 1, 2, "row"), slot: "morning", line: null, evidenceRoute: null },
    data && data.routines.ok
      ? {
        id: "P-03", page: 1, order: 3, shape: "card", visible: true, state: data.routines.value.some((routine) => routine.active) ? "data" : "empty",
        basis: "fact", days: reminderDays(data, now), startDay: 1, suggestions: [],
      }
      : { ...hidden("P-03", 1, 3, "card"), days: [], startDay: 1, suggestions: [] },
    { ...hidden("P-04", 1, 4, "row"), items: [] },
    {
      id: "P-09", page: 1, order: 5, shape: "row", visible: true, state: "empty", basis: "fact", widgets: [], suggestion: null,
      note: { key: "phone.board.custom.empty" }, action: { label: { key: "phone.board.custom.capture" }, route: "/capture" },
    },
    data ? healthPart(data, isMinor) : { ...hidden("P-06", 2, 1, "card"), metrics: [], comparison: null, source: null },
    { ...hidden("P-07", 2, 2, "row"), monthTotal: null, pending: null },
    { ...hidden("P-08", 2, 3, "card"), lines: [] },
  ];
  return {
    parts,
    approved: [],
    addWidgetRoute: "/board/widgets",
    dock: { capture: "/capture", chat: "/secondb", transcribe: { locked: true, route: null } },
    // 하루 요약(daily_note)은 W0 가 원천을 붙인다. 그 전에는 P-02 가 숨어 S-01 로 들어오는 길도 없다.
    summary: null,
    shelf: { items: shelfItems(parts, isMinor), canReorder: false },
  };
}

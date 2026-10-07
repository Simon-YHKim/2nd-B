// S-01 하루 요약: 순차 표시 · 읽기/정지 · 무음이면 음성 0 · 건강 빈칸은 앱이 채운다. 발주 2 완료조건 4.

jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }), { virtual: true });

import * as Speech from "expo-speech";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBoard } from "../board/build";
import { fillHealthBlanks, healthBlankValues, startSummaryFlow, summaryFlow, type SummaryFlowEvent, type SummaryFlowState } from "../board/summary-flow";
import { speakLine, stopSpeaking } from "../../speech/read-aloud";
import { boardFixture, SUMMARY } from "./fixtures/board-fixtures";

const TOTAL = SUMMARY.bubbles.length;

/** 화면이 하는 일을 그대로 흉내 낸다: 사건을 넣고, 읽을 말풍선이 바뀌면 읽는다. */
function drive(events: SummaryFlowEvent[], muted: boolean) {
  const spoken: number[] = [];
  let state: SummaryFlowState = startSummaryFlow(TOTAL, false);
  for (const event of events) {
    const before = state.speaking;
    state = summaryFlow(state, event, TOTAL, muted);
    if (state.speaking !== null && state.speaking !== before && !muted) spoken.push(state.speaking);
  }
  return { state, spoken };
}

describe("순차 표시", () => {
  test("처음엔 머리 하나, tick 마다 하나씩, 끝에서 멈춘다", () => {
    let state = startSummaryFlow(TOTAL, false);
    expect(state.shown).toBe(1);
    for (let i = 0; i < TOTAL + 3; i += 1) state = summaryFlow(state, { type: "tick" }, TOTAL, false);
    expect(state.shown).toBe(TOTAL);
  });

  test("움직임 줄이기면 한 번에 다 보인다", () => {
    expect(startSummaryFlow(TOTAL, true).shown).toBe(TOTAL);
  });

  test("계약의 순서: 머리 -> 사실 <=4 -> 연결 <=2 -> 제안 <=3 -> 개수", () => {
    const kinds = SUMMARY.bubbles.map((bubble) => bubble.kind);
    const rank = { head: 0, fact: 1, link: 2, suggestion: 3, count: 4 } as const;
    expect(kinds.map((kind) => rank[kind])).toEqual([...kinds.map((kind) => rank[kind])].sort((a, b) => a - b));
    expect(kinds.filter((kind) => kind === "head")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "fact").length).toBeLessThanOrEqual(4);
    expect(kinds.filter((kind) => kind === "link").length).toBeLessThanOrEqual(2);
    expect(kinds.filter((kind) => kind === "suggestion").length).toBeLessThanOrEqual(3);
    expect(kinds[kinds.length - 1]).toBe("count");
    // 머리 · 연결은 AI(청록), 제안은 AI 또는 규칙.
    for (const bubble of SUMMARY.bubbles) {
      if (bubble.kind === "head" || bubble.kind === "link") expect(bubble.basis).toBe("ai");
      if (bubble.kind === "suggestion") expect(["ai", "rule"]).toContain(bubble.basis);
    }
  });
});

describe("읽기 · 정지", () => {
  test("읽기를 누르면 처음부터, 말이 끝나야 다음 말풍선이 나온다", () => {
    const { state, spoken } = drive([{ type: "read" }, { type: "tick" }, { type: "spoken", index: 0 }, { type: "spoken", index: 1 }], false);
    expect(spoken).toEqual([0, 1, 2]);
    expect(state).toEqual({ shown: 3, reading: true, speaking: 2 });
  });

  test("읽는 동안 tick 은 말풍선을 더하지 않는다", () => {
    const { state } = drive([{ type: "read" }, { type: "tick" }, { type: "tick" }], false);
    expect(state.shown).toBe(1);
  });

  test("정지하면 읽기가 멈추고, 늦게 온 끝 알림은 무시한다", () => {
    const { state } = drive([{ type: "read" }, { type: "stop" }, { type: "spoken", index: 0 }], false);
    expect(state).toEqual({ shown: 1, reading: false, speaking: null });
  });

  test("마지막 말풍선까지 읽으면 읽기가 끝난다", () => {
    const events: SummaryFlowEvent[] = [{ type: "read" }, ...Array.from({ length: TOTAL }, (_, index) => ({ type: "spoken" as const, index }))];
    const { state, spoken } = drive(events, false);
    expect(spoken).toHaveLength(TOTAL);
    expect(state).toEqual({ shown: TOTAL, reading: false, speaking: null });
  });
});

describe("무음이면 음성 0", () => {
  test("읽기를 눌러도 읽지 않는다", () => {
    const { state, spoken } = drive([{ type: "read" }, { type: "tick" }, { type: "spoken", index: 0 }, { type: "read" }], true);
    expect(spoken).toEqual([]);
    expect(state.reading).toBe(false);
  });

  test("화면은 무음이면 [읽기] 를 그리지 않고 안내를 보인다", () => {
    const screen = readFileSync(join(process.cwd(), "src/components/dashboard/board/DailySummary.tsx"), "utf8");
    expect(screen).toContain("{!muted ? <IosButton primary glyph={flow.reading ? \"pause\" : \"play_arrow\"} onPress={() => (flow.reading ? stop() : dispatch({ type: \"read\" }))}");
    expect(screen).toContain('{muted ? <Text variant="caption" style={styles.muted}>{t("phone.board.summary.mutedNote")}</Text> : null}');
    expect(screen).toContain("if (flow.speaking === null || muted) return;");
  });
});

describe("음성 어댑터", () => {
  beforeEach(() => jest.clearAllMocks());

  test("speakLine 은 언어와 끝 · 오류 알림을 넘긴다", () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    speakLine("안녕하세요", "ko", { onDone, onError });
    expect(Speech.speak).toHaveBeenCalledWith("안녕하세요", { language: "ko", onDone, onError });
  });

  test("stopSpeaking 은 기기 음성을 멈춘다", () => {
    stopSpeaking();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });
});

describe("건강 빈칸은 앱이 채운다(흐름 2)", () => {
  test("P-06 값으로 채우고, 없는 값은 대체 문구", () => {
    const values = healthBlankValues(boardFixture("data"), (metric) => `${metric.value}${metric.unit === "count" ? "" : "분"}`);
    expect(values).toEqual({ sleep: "380분", steps: "6120", workout: "25분" });
    expect(fillHealthBlanks("수면 {{sleep}} · 식단 {{meal}}", values, "기록 없음")).toBe("수면 380분 · 식단 기록 없음");
  });

  test("지금 앱의 판에는 요약 원천이 없다(P-02 숨김, summary null)", () => {
    expect(buildBoard(null, new Date(2026, 9, 7), false).summary).toBeNull();
  });
});

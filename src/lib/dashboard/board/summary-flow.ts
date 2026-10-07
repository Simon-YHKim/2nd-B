// S-01 하루 요약의 진행(말풍선이 차례로 나타나고, 읽기를 켜면 나타나는 말풍선을 따라 읽는다).
//
// 화면은 사건(tick · read · stop · spoken)을 넘기고, 이 함수가 돌려준 상태대로 그린다. 그래서 '무음이면
// 음성 0' 같은 약속을 마운트 없이 시험할 수 있다(렌더 테스트는 RN 0.85 에서 막혀 있다).

import type { BoardContract, HealthMetric } from "./contract";

export interface SummaryFlowState {
  /** 지금까지 나타난 말풍선 수. */
  shown: number;
  reading: boolean;
  /** 읽는 중인 말풍선. 읽지 않으면 null. */
  speaking: number | null;
}

export type SummaryFlowEvent =
  | { type: "tick" }
  | { type: "read" }
  | { type: "stop" }
  | { type: "spoken"; index: number };

export function startSummaryFlow(total: number, reducedMotion: boolean): SummaryFlowState {
  // 움직임 줄이기를 켠 사람에게는 한 번에 다 보인다.
  return { shown: reducedMotion ? total : Math.min(1, total), reading: false, speaking: null };
}

export function summaryFlow(state: SummaryFlowState, event: SummaryFlowEvent, total: number, muted: boolean): SummaryFlowState {
  switch (event.type) {
    case "tick":
      // 읽는 동안에는 말이 끝나야 다음 말풍선이 나온다.
      return !state.reading && state.shown < total ? { ...state, shown: state.shown + 1 } : state;
    case "read":
      // 무음이면 글만: 읽기를 시작하지 않는다.
      if (muted || total === 0) return state;
      return { shown: Math.max(state.shown, 1), reading: true, speaking: 0 };
    case "stop":
      return { ...state, reading: false, speaking: null };
    case "spoken": {
      if (!state.reading || event.index !== state.speaking) return state;
      const next = event.index + 1;
      if (next >= total) return { shown: total, reading: false, speaking: null };
      return { shown: Math.max(state.shown, next + 1), reading: true, speaking: next };
    }
  }
}

/** 요약 문장의 건강 빈칸({{sleep}} 등)에 넣을 값. 판의 P-06 에서 온다. */
export function healthBlankValues(board: BoardContract, format: (metric: HealthMetric) => string): Record<string, string> {
  const health = board.parts.find((part) => part.id === "P-06");
  if (!health || health.id !== "P-06") return {};
  return Object.fromEntries(health.metrics.map((metric) => [metric.metric, format(metric)]));
}

/** 빈칸을 앱이 가진 값으로 채운다. 값이 없으면 fallback. 숫자는 이 기기에서만 붙는다. */
export function fillHealthBlanks(text: string, values: Record<string, string>, fallback: string): string {
  return text.replace(/\{\{(sleep|steps|workout|meal)\}\}/g, (_match, key: string) => values[key] ?? fallback);
}

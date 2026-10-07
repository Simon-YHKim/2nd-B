// 하루 관리판의 색은 계약의 basis 하나로만 정한다(문구 · 색 원칙, Simon 2026-10-07 02:32).
// 청록 = AI 의 해석 · 제안 / 회색 = 출처 있는 사실 · 규칙 제안 / 점선 = 연동 전 잠김.
// 색 값은 인앱 핸드폰의 픽셀 아이폰 토큰(iOS 밝은 기본, Simon 2026-10-07)에서 온다.

import { phoneIos } from "../../theme/phone-ios";
import type { BoardBasis } from "./contract";

export interface BoardTone {
  /** 문장 색. */
  text: string;
  /** 테두리 색. */
  border: string;
  borderStyle: "solid" | "dashed";
  /** 위젯 칸 바탕. */
  fill: string;
  /** S-01 말풍선 바탕. */
  bubble: string;
}

export function boardTone(basis: BoardBasis): BoardTone {
  switch (basis) {
    case "ai": return { text: phoneIos.aiText, border: phoneIos.teal, borderStyle: "solid", fill: phoneIos.cell, bubble: phoneIos.aiFill };
    case "fact": return { text: phoneIos.label2, border: phoneIos.separator, borderStyle: "solid", fill: phoneIos.cell, bubble: phoneIos.cell };
    case "rule": return { text: phoneIos.label2, border: phoneIos.separator, borderStyle: "solid", fill: phoneIos.cell, bubble: phoneIos.fill };
    case "locked": return { text: phoneIos.label2, border: phoneIos.label2, borderStyle: "dashed", fill: phoneIos.fill, bubble: phoneIos.fill };
  }
}

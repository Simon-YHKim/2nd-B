// 하루 관리판의 색은 계약의 basis 하나로만 정한다(문구 · 색 원칙, Simon 2026-10-07 02:32).
// 청록 = AI 의 해석 · 제안 / 회색 = 출처 있는 사실 · 규칙 제안 / 점선 = 연동 전 잠김.

import { m3, m3Accent } from "../../theme/m3";
import type { BoardBasis } from "./contract";

export interface BoardTone {
  /** 문장 색. */
  text: string;
  /** 테두리 색. */
  border: string;
  borderStyle: "solid" | "dashed";
}

export function boardTone(basis: BoardBasis): BoardTone {
  switch (basis) {
    case "ai": return { text: m3Accent.skyText, border: m3Accent.skyText, borderStyle: "solid" };
    case "fact":
    case "rule": return { text: m3.color.onSurfaceVariant, border: m3.color.outline, borderStyle: "solid" };
    case "locked": return { text: m3.color.onSurfaceVariant, border: m3.color.outline, borderStyle: "dashed" };
  }
}

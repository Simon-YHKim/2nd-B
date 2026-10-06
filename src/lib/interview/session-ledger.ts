// 인터뷰 화면 쪽 판정 원장(0220) 배선. Q-261005-09 B안의 1 · 2단계.
//
//   1단계  판정 호출마다 메타를 실어 보낸다(`turnMetaFor`) -> openai-proxy 가 원장 한 행을 쓴다.
//          대화가 끝나면 세션 행에 종료 사유를 적는다(`closeInterviewSession`).
//   2단계  '담기' 가 칸을 클라이언트 upsert 대신 서버 함수로 더한다(`commitInterviewSession`).
//          운영에 그 함수가 없거나, 이 세션의 원장이 비어 있으면(옛 프록시 · 모의 모드)
//          지금까지의 경로(`addCoverage`)로 돌아간다(`needsClientCoverageFallback`).
//
// ⚠ 셋 다 **fail-soft** 다. 원장은 측정 장치이지 대화의 문이 아니다 -- 기록이 실패해도
// 대화와 저장은 그대로 끝나야 한다. 다만 '담기' 쪽은 방향이 있다: 서버가 이미 더했을지
// 모르는 실패(응답 유실)에서는 클라이언트 경로로 **다시 더하지 않는다.** 두 번 더하면
// 밝기가 부풀고, 부푼 밝기는 거짓말이다. 덜 찬 것은 그냥 덜 찬 것이다.
//
// 저장하지 않은 세션은 소유자 없이 집계만 남는다(Q3 a): 서버가 일정 시간 뒤 세션 행의
// 소유자와 감사 행 연결을 지운다(0220 `anonymize_interview_sessions`). 화면은 할 일이 없다.

import { randomUUID } from "expo-crypto";
import { getSupabaseClient } from "../supabase/client";
import { localGate } from "./answer-gate";
import { currentScene } from "./continuity";
import { DRILL_LAYERS, type DrillLayer, type InterviewTurn, type LifePeriod } from "./probe";
import type { InterviewTurnMeta, LedgerEndReason } from "./verdict-ledger";

/** 이 화면 한 번 = 세션 하나. 서버는 이 번호로 원장 행을 묶는다. */
export function newInterviewSessionId(): string {
  return randomUUID().toLowerCase();
}

/** 지금 몇 번째 장면인가(1부터). 장면은 `sceneStart` 턴에서 시작한다(씨앗 질문 · 다른 장면). */
export function sceneSeqOf(history: readonly InterviewTurn[]): number {
  return Math.max(1, history.filter((turn) => turn.sceneStart === true).length);
}

/**
 * 판정 호출에 실어 보낼 메타. 마지막 턴이 사용자 답일 때만 만든다(없으면 undefined).
 *
 * 질문 종류는 그 답 **바로 앞의 인터뷰어 턴**에서 읽는다. 겨냥한 층은 그 답의 층이다 --
 * 프롬프트의 마지막 줄 `A (<층>): <답>` 과 같은 값이어야 서버가 문턱을 다시 계산한다.
 */
export function turnMetaFor(args: {
  sessionId: string;
  period: LifePeriod;
  locale: "en" | "ko";
  history: readonly InterviewTurn[];
}): InterviewTurnMeta | undefined {
  const { history } = args;
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return undefined;
  let probeKind: InterviewTurnMeta["probeKind"] = "drill";
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn?.role === "interviewer") {
      probeKind = turn.askKind ?? "drill";
      break;
    }
  }
  const askedLayer = last.layer ?? null;
  return {
    sessionId: args.sessionId,
    period: args.period,
    locale: args.locale,
    sceneSeq: sceneSeqOf(history),
    turnSeq: Math.max(1, currentScene(history).filter((turn) => turn.role === "user").length),
    askedLayer,
    probeKind,
    localGate: localGate(last.text, askedLayer, args.locale),
    answerText: last.text,
    openerUnedited: last.openerUnedited === true,
  };
}

/**
 * `nextMove` 가 판정을 기다리지 않고 `finish` 를 냈을 때의 종료 사유. `nextMove` 는 이유를
 * 돌려주지 않으므로(테스트가 그 모양을 고정한다) 화면이 가진 같은 재료로 가른다:
 * 막힌 층이 있었거나 모든 층을 포기했으면 발판 소진, 아니면 장면을 다 판 것이다.
 */
export function endReasonForLocalFinish(
  stuck: { layer: DrillLayer; streak: number } | null,
  abandoned: readonly DrillLayer[],
): LedgerEndReason {
  if (stuck) return "scaffold_exhausted";
  if (abandoned.length >= DRILL_LAYERS.length) return "scaffold_exhausted";
  return "complete";
}

interface RpcReply {
  data: unknown;
  error: { code?: string; message?: string } | null;
  status?: number;
}

/** 운영에 0220 이 아직 없을 때의 모양. PostgREST 는 모르는 함수를 404 · PGRST202 로 돌려준다. */
export function isMissingRpc(reply: Pick<RpcReply, "error" | "status">): boolean {
  if (!reply.error) return false;
  return reply.status === 404 || reply.error.code === "PGRST202" || reply.error.code === "42883";
}

/**
 * 대화가 끝났다는 기록. 세션 행이 없으면(판정 호출이 한 번도 없던 대화) 서버가 만든다.
 * 몇 번 막혔는지 · 발판을 몇 번 보였는지는 클라이언트가 센 값이다(서버가 볼 수 없는 턴).
 * 어떤 실패도 던지지 않는다.
 */
export async function closeInterviewSession(args: {
  sessionId: string;
  period: LifePeriod;
  locale: "en" | "ko";
  reason: LedgerEndReason;
  localBlocks: number;
  scaffolds: number;
}): Promise<"closed" | "skipped"> {
  try {
    const { data, error } = (await getSupabaseClient().rpc("close_interview_session", {
      p_session_id: args.sessionId,
      p_period: args.period,
      p_locale: args.locale,
      p_end_reason: args.reason,
      p_local_blocks: Math.max(0, Math.trunc(args.localBlocks)),
      p_scaffolds: Math.max(0, Math.trunc(args.scaffolds)),
    })) as RpcReply;
    if (error) return "skipped";
    return data === "closed" ? "closed" : "skipped";
  } catch {
    return "skipped";
  }
}

export type CommitOutcome =
  /** 서버가 원장에서 칸을 계산해 더했다. `ledgerRows` 는 이 세션의 원장 행 수다. */
  | { kind: "committed"; ledgerRows: number; cellsAdded: number }
  /** 이미 저장한 세션이다(다시 더하지 않았다). */
  | { kind: "already" }
  /** 운영에 함수가 없거나 이 사용자의 세션 행이 없다. */
  | { kind: "missing" }
  /** 그 밖의 실패. 서버가 이미 더했을 수 있다. */
  | { kind: "failed" };

/** '담기' 가 서버에 칸 계산을 맡긴다(2단계). 던지지 않는다. */
export async function commitInterviewSession(sessionId: string): Promise<CommitOutcome> {
  try {
    const reply = (await getSupabaseClient().rpc("commit_interview_session", {
      p_session_id: sessionId,
    })) as RpcReply;
    if (isMissingRpc(reply)) return { kind: "missing" };
    if (reply.error) return { kind: "failed" };
    const body = reply.data;
    if (typeof body !== "object" || body === null) return { kind: "failed" };
    const o = body as { status?: unknown; ledger_rows?: unknown; cells_added?: unknown };
    if (o.status === "not_found") return { kind: "missing" };
    if (o.status === "already_committed") return { kind: "already" };
    if (o.status !== "committed") return { kind: "failed" };
    const ledgerRows = typeof o.ledger_rows === "number" && Number.isSafeInteger(o.ledger_rows) ? o.ledger_rows : -1;
    const cellsAdded = typeof o.cells_added === "number" && Number.isSafeInteger(o.cells_added) ? o.cells_added : -1;
    if (ledgerRows < 0 || cellsAdded < 0) return { kind: "failed" };
    return { kind: "committed", ledgerRows, cellsAdded };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * 서버 계산 대신 지금까지의 클라이언트 경로(`addCoverage`)로 칸을 더해야 하나.
 *
 * - 함수가 없다(운영 미적용) · 이 사용자의 세션 행이 없다: 예. 서버는 아무것도 더하지 않았다.
 * - 저장은 됐지만 원장이 비어 있었다(0행): 예. 옛 프록시 · 모의 모드 · 다른 벤더 좌석이라
 *   판정이 기록되지 않은 대화다. 서버가 더한 칸도 0 이다.
 * - 그 밖(더했음 · 이미 저장 · 알 수 없는 실패): 아니오. 다시 더하면 두 번 센다.
 */
export function needsClientCoverageFallback(outcome: CommitOutcome): boolean {
  if (outcome.kind === "missing") return true;
  return outcome.kind === "committed" && outcome.ledgerRows === 0;
}

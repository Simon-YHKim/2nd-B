// 인터뷰 화면 쪽 판정 원장 배선(0220): 메타 만들기 · 종료 사유 · '담기' 의 서버 계산과 폴백.
//
// 폴백의 방향이 이 파일의 핵심이다. 서버가 더하지 않은 것이 확실할 때(함수 없음 · 세션 없음 ·
// 원장 0행)만 예전 클라이언트 경로로 더하고, 서버가 이미 더했을 수 있는 실패에서는 더하지 않는다.
// 두 번 더하면 밝기가 부푼다.

const mockRpc = jest.fn();

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

import {
  closeInterviewSession,
  commitInterviewSession,
  endReasonForLocalFinish,
  isMissingRpc,
  needsClientCoverageFallback,
  newInterviewSessionId,
  sceneSeqOf,
  turnMetaFor,
  type CommitOutcome,
} from "../session-ledger";
import { readInterviewTurnMeta } from "../verdict-ledger";
import type { InterviewTurn } from "../probe";

const SESSION = "4f1d2c3b-5a69-4e7d-8c1b-0a2b3c4d5e6f";

describe("turnMetaFor", () => {
  const history: InterviewTurn[] = [
    { role: "interviewer", text: "씨앗", layer: "fact", period: "now", sceneStart: true, askKind: "seed" },
    { role: "user", text: "요즘 회사에서 팀을 옮기게 됐어요", layer: "fact", period: "now", answered: true },
    { role: "interviewer", text: "발판", layer: "feeling", period: "now", askKind: "scaffold" },
    { role: "user", text: "답답했어", layer: "feeling", period: "now" },
  ];

  it("마지막 답의 층 · 바로 앞 질문의 종류 · 장면과 순번을 담는다", () => {
    const meta = turnMetaFor({ sessionId: SESSION, period: "now", locale: "ko", history });
    expect(meta).toEqual({
      sessionId: SESSION, period: "now", locale: "ko", sceneSeq: 1, turnSeq: 2,
      askedLayer: "feeling", probeKind: "scaffold", localGate: "pass", answerText: "답답했어", openerUnedited: false,
    });
    expect(readInterviewTurnMeta(meta)).toEqual(meta);
  });

  it("다른 장면으로 넘어가면 장면 번호가 오르고 순번은 그 장면에서 다시 센다", () => {
    const next: InterviewTurn[] = [
      ...history,
      { role: "interviewer", text: "다른 장면", layer: "fact", period: "now", sceneStart: true, askKind: "seed" },
      { role: "user", text: "주말에 혼자 등산을 다녀왔어요", layer: "fact", period: "now", openerUnedited: true },
    ];
    expect(sceneSeqOf(next)).toBe(2);
    expect(turnMetaFor({ sessionId: SESSION, period: "now", locale: "ko", history: next })).toEqual(
      expect.objectContaining({ sceneSeq: 2, turnSeq: 1, probeKind: "seed", openerUnedited: true, localGate: "pass" }),
    );
  });

  it("겨냥한 층이 없는 답은 null 로, 질문 종류가 안 적힌 질문은 drill 로 본다", () => {
    const meta = turnMetaFor({
      sessionId: SESSION, period: "now", locale: "en",
      history: [{ role: "interviewer", text: "q" }, { role: "user", text: "the playground" }],
    });
    expect(meta).toEqual(expect.objectContaining({ askedLayer: null, probeKind: "drill", localGate: "short", sceneSeq: 1 }));
  });

  it("마지막 턴이 답이 아니면 메타가 없다", () => {
    expect(turnMetaFor({ sessionId: SESSION, period: "now", locale: "ko", history: history.slice(0, 3) })).toBeUndefined();
    expect(turnMetaFor({ sessionId: SESSION, period: "now", locale: "ko", history: [] })).toBeUndefined();
  });

  it("세션 번호는 원장이 받는 uuid 모양이다", () => {
    const id = newInterviewSessionId();
    expect(readInterviewTurnMeta({ ...turnMetaFor({ sessionId: id, period: "now", locale: "ko", history }) })).not.toBeNull();
  });
});

describe("endReasonForLocalFinish", () => {
  it("막힌 층이 있었거나 모든 층을 포기했으면 발판 소진, 아니면 다 판 것", () => {
    expect(endReasonForLocalFinish({ layer: "fact", streak: 3 }, [])).toBe("scaffold_exhausted");
    expect(endReasonForLocalFinish(null, ["fact", "feeling", "meaning", "belief", "echo"])).toBe("scaffold_exhausted");
    expect(endReasonForLocalFinish(null, ["fact"])).toBe("complete");
    expect(endReasonForLocalFinish(null, [])).toBe("complete");
  });
});

describe("commitInterviewSession · needsClientCoverageFallback", () => {
  beforeEach(() => mockRpc.mockReset());

  it.each<[string, unknown, CommitOutcome, boolean]>([
    ["함수가 없다(404)", { data: null, error: { code: "PGRST202", message: "not found" }, status: 404 }, { kind: "missing" }, true],
    ["함수가 없다(42883)", { data: null, error: { code: "42883", message: "undefined function" }, status: 400 }, { kind: "missing" }, true],
    ["이 사용자의 세션이 없다", { data: { status: "not_found" }, error: null, status: 200 }, { kind: "missing" }, true],
    ["원장이 비어 있었다", { data: { status: "committed", ledger_rows: 0, cells_added: 0 }, error: null, status: 200 },
      { kind: "committed", ledgerRows: 0, cellsAdded: 0 }, true],
    ["서버가 더했다", { data: { status: "committed", ledger_rows: 6, cells_added: 2 }, error: null, status: 200 },
      { kind: "committed", ledgerRows: 6, cellsAdded: 2 }, false],
    ["이미 저장했다", { data: { status: "already_committed" }, error: null, status: 200 }, { kind: "already" }, false],
    ["서버 오류", { data: null, error: { code: "57014", message: "timeout" }, status: 500 }, { kind: "failed" }, false],
    ["모양이 다른 응답", { data: { status: "committed", ledger_rows: "6" }, error: null, status: 200 }, { kind: "failed" }, false],
    ["모르는 상태", { data: { status: "queued" }, error: null, status: 200 }, { kind: "failed" }, false],
  ])("%s", async (_label, reply, outcome, fallback) => {
    mockRpc.mockResolvedValue(reply);
    const result = await commitInterviewSession(SESSION);
    expect(mockRpc).toHaveBeenCalledWith("commit_interview_session", { p_session_id: SESSION });
    expect(result).toEqual(outcome);
    expect(needsClientCoverageFallback(result)).toBe(fallback);
  });

  it("네트워크가 던져도 던지지 않고, 다시 더하지도 않는다", async () => {
    mockRpc.mockRejectedValue(new Error("offline"));
    const result = await commitInterviewSession(SESSION);
    expect(result).toEqual({ kind: "failed" });
    expect(needsClientCoverageFallback(result)).toBe(false);
  });

  it("isMissingRpc 는 오류가 있을 때만 참이다", () => {
    expect(isMissingRpc({ error: null, status: 404 })).toBe(false);
    expect(isMissingRpc({ error: { code: "PGRST116" }, status: 406 })).toBe(false);
  });
});

describe("closeInterviewSession", () => {
  beforeEach(() => mockRpc.mockReset());

  it("종료 사유와 클라이언트 셈을 넘긴다", async () => {
    mockRpc.mockResolvedValue({ data: "closed", error: null, status: 200 });
    await expect(closeInterviewSession({
      sessionId: SESSION, period: "school", locale: "ko", reason: "user_end", localBlocks: 2.7, scaffolds: -1,
    })).resolves.toBe("closed");
    expect(mockRpc).toHaveBeenCalledWith("close_interview_session", {
      p_session_id: SESSION, p_period: "school", p_locale: "ko", p_end_reason: "user_end",
      p_local_blocks: 2, p_scaffolds: 0,
    });
  });

  it.each([
    [{ data: null, error: { code: "PGRST202" }, status: 404 }],
    [{ data: "rate_limited", error: null, status: 200 }],
  ])("실패는 조용히 skipped (%p)", async (reply) => {
    mockRpc.mockResolvedValue(reply);
    await expect(closeInterviewSession({
      sessionId: SESSION, period: "school", locale: "ko", reason: "left", localBlocks: 0, scaffolds: 0,
    })).resolves.toBe("skipped");
  });

  it("던져도 던지지 않는다", async () => {
    mockRpc.mockRejectedValue(new Error("offline"));
    await expect(closeInterviewSession({
      sessionId: SESSION, period: "school", locale: "ko", reason: "left", localBlocks: 0, scaffolds: 0,
    })).resolves.toBe("skipped");
  });
});

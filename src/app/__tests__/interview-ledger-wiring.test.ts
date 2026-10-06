// 인터뷰 화면의 판정 원장 배선(0220, Q-261005-09 B안 1 · 2단계).
//
// 렌더 테스트는 이 저장소에서 막혀 있어(RN 0.85) 화면은 주석을 뺀 코드로 본다.
//   - 판정 호출마다 메타를 싣는다(실제 프롬프트와 같은 history 로 만든다)
//   - finish 는 언제나 원장이 아는 종료 사유 하나를 받고, 세션 행을 닫는다
//   - '담기' 는 서버 계산(commit)을 먼저 부르고, 클라이언트 덧셈은 폴백 안에만 있다
//   - 규칙(짧은 답 · 거부권 · 3회 실패 · 위기 안내 뒤)은 이 PR 에서 바뀌지 않는다

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import { LEDGER_END_REASONS } from "../../lib/interview/verdict-ledger";

const SRC = readFileSync(join(__dirname, "..", "interview.tsx"), "utf8").replace(/\r\n/g, "\n");
const CODE = (() => {
  const sf = ts.createSourceFile("interview.tsx", SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ts.createPrinter({ removeComments: true }).printFile(sf).replace(/\s+/g, " ");
})();

function between(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = a < 0 ? -1 : src.indexOf(to, a + from.length);
  return a < 0 || b < 0 ? "" : src.slice(a, b);
}

describe("interview screen -> verdict ledger", () => {
  it("모든 finish 호출이 원장의 종료 사유 하나를 넘긴다", () => {
    const calls = [...CODE.matchAll(/\bfinish\(([^)]*\)?)\)/g)].map((m) => m[1]);
    expect(calls).toHaveLength(8);
    const literal = calls.filter((arg) => arg.startsWith('"'));
    for (const arg of literal) expect(LEDGER_END_REASONS).toContain(arg.slice(1, -1));
    const computed = calls.filter((arg) => !arg.startsWith('"'));
    expect(computed).toEqual(["endReasonForLocalFinish(stuck, giveUp)"]);
    // 이 화면이 지금 내는 사유. crisis · error 는 3단계 규칙의 몫이라 아직 없다.
    expect(new Set(literal.map((arg) => arg.slice(1, -1)))).toEqual(new Set([
      "complete", "verdict_exhausted", "no_question", "day_limit", "user_stop", "skip_exhausted", "user_end",
    ]));
    expect(CODE).not.toMatch(/\bfinish\(\)/);
    expect(CODE).not.toContain("onPress={finish}");
  });

  it("finish 는 세션 행을 한 번만 닫고, 저장 · 칸 쓰기는 하지 않는다", () => {
    const finish = between(CODE, "const finish = useCallback(", "useEffect(");
    expect(finish).toContain("ended.current = true;");
    expect(finish).toContain("closeLedger(reason);");
    expect(finish).not.toMatch(/createRecord|addCoverage|commitInterviewSession/);
    const close = between(CODE, "const closeLedger = useCallback(", "const finish = useCallback(");
    expect(close).toContain("if (ledgerClosed.current) return;");
    expect(close).toContain("closeInterviewSession({");
  });

  it("답을 하나라도 보낸 뒤 끝내지 않고 떠나면 left 로 닫는다", () => {
    expect(CODE).toContain('if (ledgerCounts.current.answered) closeLedger("left");');
    expect(CODE).toContain("useEffect(() => () => leaveLedger.current(), []);");
  });

  it("판정 호출에는 그 호출의 history 로 만든 메타를 싣는다", () => {
    const ask = between(CODE, "const ask = useCallback(", "async function send(");
    expect(ask).toContain('0, move.kind === "finish" ? credited : move.layer, turnMetaFor({ sessionId, period, locale, history })');
  });

  it("질문 턴마다 종류를 적는다(씨앗 · 모델 · 발판 · 되묻기)", () => {
    expect(CODE).toContain('sceneStart: true, askKind: "seed" }');
    expect(CODE).toContain('sceneStart: choice === "skip", askKind: "seed" }');
    expect(CODE).toContain('layer: probe.layer, period, askKind: "drill" }');
    expect(CODE).toContain('period, askKind: "confirm" }');
    expect(CODE.match(/askKind: "scaffold"/g)).toHaveLength(2);
    expect(CODE.match(/ledgerCounts\.current\.scaffolds \+= 1;/g)).toHaveLength(2);
  });

  it("말문 후보를 그대로 보낸 답을 표시만 한다 -- 인정 규칙은 그대로다", () => {
    const send = between(CODE, "async function send(", "function changeAngle(");
    expect(send).toContain("openerUnedited: openers.includes(text)");
    expect(send).toContain("const blocked = isLocalNonAnswer(text, pendingLayer);");
    expect(send).toContain("if (blocked) ledgerCounts.current.localBlocks += 1;");
    expect(send).toContain("await ask(nextTurns, nextCoverage, stuck, nextAbandoned, blocked ? null : pendingLayer);");
  });

  it("'담기' 는 서버 계산을 먼저 부르고, 클라이언트 덧셈은 폴백 안에만 있다", () => {
    const keep = between(CODE, "async function keepIt(", "return (");
    const commit = keep.indexOf("const committed = await commitInterviewSession(sessionId);");
    const guard = keep.indexOf("if (needsClientCoverageFallback(committed)) {");
    const add = keep.indexOf("await addCoverage(userId, delta);");
    const record = keep.indexOf("await createRecord({");
    expect(record).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(record);
    expect(guard).toBeGreaterThan(commit);
    expect(add).toBeGreaterThan(guard);
    expect(keep.match(/addCoverage\(/g)).toHaveLength(1);
    // 위기 후속은 여전히 칸보다 먼저다.
    expect(keep.indexOf('saved.followup?.zone === "red"')).toBeLessThan(commit);
  });

  it("3단계 규칙은 바뀌지 않았다 (위기 안내 뒤 계속 · 세 번째 실패에 종료 · 확인은 화면 판정)", () => {
    const ask = between(CODE, "const ask = useCallback(", "async function send(");
    expect(ask).toContain('if (probe.zone === "red") { setCrisis({ visible: true, hotline: hotlineFor() }); return; }');
    expect(ask).toContain("confirmedAnswer(lastAnswer.text, credited, locale, probe.answeredLayer)");
    expect(ask).toContain('setTurns(assessed); finish("verdict_exhausted"); return;');
  });
});

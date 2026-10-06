// 인터뷰 판정 원장 쓰기 (0220, Q-261005-09 B안 1단계). openai-proxy 의 interview_probe 좌석 전용.
//
// 무엇을 하나: 판정 호출 한 번이 끝나면, 앱이 실어 보낸 `interviewTurn` 메타와 **프록시가 직접
// 본 것**(실제 프롬프트, 모델 출력)으로 원장 한 행을 만들어 `record_interview_probe_verdict` 에
// 넘긴다. 행에는 원문 · 해시가 없다(숫자 · 열거값만). 규칙은 `src/lib/interview/verdict-ledger.ts`
// 에 있고 이 파일은 그것을 잇기만 한다.
//
// 실패해도 응답을 막지 않는다 -- 감사 행 쓰기(openai-proxy/index.ts)와 같은 규율이다. 원장이
// 빠진 호출은 '담기' 때 칸이 덜 오를 뿐이고(덜 찬 것), 대화는 그대로 이어진다.
// 메타가 없는 요청(옛 앱)과 메타가 어긋난 요청은 아무것도 쓰지 않는다.

import { answerLengthBucket, localGate } from '../../../src/lib/interview/answer-gate.ts';
import { buildVerdictLedgerRow, verdictRpcArgs } from '../../../src/lib/interview/verdict-ledger.ts';
import { sanitizeUntrusted } from '../../../src/lib/llm/untrusted.ts';

type ExecuteRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data?: unknown; error?: { message?: string } | null }>;

export interface InterviewVerdictInput {
  userId: string;
  /** 이 호출의 ai_audit_log.id. 감사 행이 실제로 쓰였을 때만 원장을 쓴다. */
  auditId: string;
  audited: boolean;
  rawMeta: unknown;
  userText: string;
  modelText: string;
}

/** 쓴 결과. 호출부는 이 값으로 아무것도 바꾸지 않는다(로그 · 테스트용). */
export type InterviewVerdictOutcome = 'recorded' | 'skipped' | 'failed';

export async function recordInterviewVerdict(
  rpc: ExecuteRpc,
  input: InterviewVerdictInput,
): Promise<InterviewVerdictOutcome> {
  try {
    if (!input.audited || input.rawMeta === undefined) return 'skipped';
    const row = buildVerdictLedgerRow(input.rawMeta, input.userText, input.modelText, {
      sanitize: sanitizeUntrusted,
      gate: localGate,
      bucket: answerLengthBucket,
    });
    if (!row) return 'skipped';
    const { error } = await rpc('record_interview_probe_verdict', verdictRpcArgs(input.userId, input.auditId, row));
    if (error) {
      // 운영에 0220 이 아직 없으면 여기로 온다. 원문 · 메타는 로그에 남기지 않는다.
      console.warn('[openai-proxy] interview verdict ledger write failed');
      return 'failed';
    }
    return 'recorded';
  } catch {
    console.warn('[openai-proxy] interview verdict ledger write threw');
    return 'failed';
  }
}

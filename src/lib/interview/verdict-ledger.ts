// 인터뷰 판정 원장(마이그레이션 0220)의 약속. **이 파일은 import 가 없다.**
//
// 설계: docs/design/interview-measurement-261006.md (Q-261005-09 = A, 추천 B 채택
// 2026-10-06 22:33 · DECISIONS). 이 파일은 그 3.3 · 3.4 절의 1 · 2단계만 담는다 --
// 판정 호출 1회 = 원장 1행(숫자 · 열거값, 원문 없음), 세션 행의 종료 사유, 그리고
// '담기' 때 서버가 원장에서 칸을 계산하는 것. 짧은 답 · 거부권 · "다른 장면으로 갈까요?" ·
// 위기 안내 뒤 종료 같은 **규칙 변경(4절 P1~P7)은 여기 없다.** "기록 먼저, 규칙은 따로".
//
// 양쪽이 같은 파일을 읽는다:
//   - 앱: 인터뷰 화면이 판정 호출에 실어 보낼 메타의 모양(`InterviewTurnMeta`)
//   - openai-proxy: 그 메타를 검사하고, 모델 출력에서 판정을 읽고, 원장 행을 만든다
//     (`supabase/functions/_shared/interview-verdict.ts` 가 `.ts` 경로로 이 파일을 읽는다)
// Deno 는 확장자 없는 상대 import 를 못 풀어서 이 파일은 아무것도 import 하지 않는다.
// 프록시가 써야 하는 문턱(`answer-gate.ts`)과 펜스 정리(`untrusted.ts`)는 인자로 받는다.

export type LedgerLocale = "en" | "ko";
export type LedgerLayer = "fact" | "feeling" | "meaning" | "belief" | "echo";

export const LEDGER_LAYERS: readonly LedgerLayer[] = ["fact", "feeling", "meaning", "belief", "echo"];

/** 시기 키. 0143 `interview_coverage.period` 와 같은 값이고, 0220 의 서버 함수가 같은 목록으로 검사한다. */
export const LEDGER_PERIODS = ["infancy", "school", "twenties", "later", "work", "now"] as const;
export type LedgerPeriod = (typeof LEDGER_PERIODS)[number];

/**
 * 이 답이 **어떤 질문에 대한 답인가.** 판정 호출은 언제나 "다음 질문" 을 만들지만,
 * 기록하는 것은 방금 답한 질문의 종류다(설계 M5 발판 회복률 · P4 의 재료).
 *   seed     문을 여는 고정 질문(시기 씨앗 · 다른 장면 · 구체 질문)
 *   drill    모델이 만든 질문
 *   scaffold 막혔을 때의 고정 발판
 *   confirm  되묻기(loopCheck) · 확인 질문
 */
export const LEDGER_PROBE_KINDS = ["seed", "drill", "scaffold", "confirm"] as const;
export type LedgerProbeKind = (typeof LEDGER_PROBE_KINDS)[number];

/**
 * 대화가 끝난 이유(설계 2절 M2). 지금 화면이 실제로 내는 값은 아래 주석의 여덟 개이고,
 * `crisis` · `error` 는 3단계 규칙(P7 위기 안내 뒤 종료 · P3 판정 없음 상한)이 쓸 자리다.
 *   complete           장면을 다 팠다(인정된 진전으로 끝남)
 *   user_end           '그만' 버튼
 *   user_stop          답으로 그만하겠다고 함("그만할래요" 등)
 *   skip_exhausted     건너뛰기만 이어져 로컬 안전장치가 끝냄
 *   scaffold_exhausted 발판을 다 써도 막힘
 *   verdict_exhausted  한 층에서 세 번 판정을 못 받음
 *   no_question        다음 질문을 만들지 못함
 *   day_limit          서버가 오늘 몫이 찼다고 거절
 *   crisis · error     (3단계 몫, 지금은 내지 않는다)
 *   left               끝내지 않고 화면을 떠남(답을 하나 이상 보낸 뒤)
 */
export const LEDGER_END_REASONS = [
  "complete",
  "user_end",
  "user_stop",
  "skip_exhausted",
  "scaffold_exhausted",
  "verdict_exhausted",
  "no_question",
  "day_limit",
  "crisis",
  "error",
  "left",
] as const;
export type LedgerEndReason = (typeof LEDGER_END_REASONS)[number];

/**
 * 서버가 적는 로컬 문턱. 앞의 셋은 `answer-gate.ts` 의 `localGate` 값이고, 뒤의 둘은
 * 서버가 그 값을 **믿을 수 없을 때** 적는다:
 *   mismatch   서버가 다시 계산한 값이 클라이언트가 보낸 값과 다르다
 *   unverified 보낸 답이 실제 프롬프트의 마지막 답과 같은지 확인하지 못해 다시 계산하지 않았다
 * 칸은 `pass` 일 때만 오른다(0220 `commit_interview_session`).
 */
export const LEDGER_LOCAL_GATES = ["pass", "short", "non_answer", "mismatch", "unverified"] as const;
export type LedgerLocalGate = (typeof LEDGER_LOCAL_GATES)[number];
export type ClientLocalGate = "pass" | "short" | "non_answer";

/**
 * 모델 판정(설계 3.3 `verdict`). 모델이 직전 답을 겨냥한 층에 닿았다고 했는가.
 *   credited    겨냥한 층이라고 했다(로컬 문턱은 따로 `local_gate` 에)
 *   none        닿지 않았다고 했다
 *   other_layer 다른 층이라고 했다
 *   no_verdict  판정이 없거나 읽을 수 없었다(JSON 깨짐 포함)
 *   unasked     겨냥한 층이 없는 답이라 판정 대상이 아니다(되묻기에 대한 답)
 *   error       (호출 실패 기록용, 지금은 쓰지 않는다)
 */
export const LEDGER_VERDICTS = ["credited", "none", "other_layer", "no_verdict", "unasked", "error"] as const;
export type LedgerVerdict = (typeof LEDGER_VERDICTS)[number];

/** 판정 호출에 실어 보내는 메타. **원문은 `answerText` 하나이고, 서버는 그것을 저장하지 않는다.** */
export interface InterviewTurnMeta {
  sessionId: string;
  period: LedgerPeriod;
  locale: LedgerLocale;
  /** 장면 번호(1부터). 다른 장면으로 넘어갈 때마다 1 오른다. */
  sceneSeq: number;
  /** 그 장면 안에서 이 답의 순번(1부터). */
  turnSeq: number;
  /** 이 답이 겨냥한 층. 프롬프트의 마지막 줄 `A (<층>): ...` 의 층과 같다. 없으면 null. */
  askedLayer: LedgerLayer | null;
  probeKind: LedgerProbeKind;
  /** 클라이언트가 계산한 문턱. 서버는 이것을 믿지 않고 다시 계산해 비교만 한다. */
  localGate: ClientLocalGate;
  /** 방금 보낸 답. 서버는 문턱을 다시 계산하는 데만 쓰고 버린다. */
  answerText: string;
  /** 직전 질문의 말문 후보를 고치지 않고 그대로 보냈는가(설계 M6). */
  openerUnedited: boolean;
}

/** 세션 번호 · 장면 · 순번의 상한. 넘으면 메타 전체를 버린다(기록하지 않는다). */
export const LEDGER_MAX_SEQ = 10_000;
/** 답 원문 상한. 프록시의 user 프롬프트 상한(8000자)과 같다. */
export const LEDGER_MAX_ANSWER_LEN = 8000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function seq(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= LEDGER_MAX_SEQ
    ? value
    : null;
}

/**
 * 프록시가 받은 `interviewTurn` 을 읽는다. 하나라도 어긋나면 **null** -- 기록하지 않는다.
 * 고쳐 읽지 않는 이유: 이 값들은 칸 계산의 재료라, 추측으로 메운 행은 없는 행보다 나쁘다.
 */
export function readInterviewTurnMeta(raw: unknown): InterviewTurnMeta | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const sessionId = typeof o.sessionId === "string" ? o.sessionId.toLowerCase() : "";
  if (!UUID_RE.test(sessionId)) return null;
  if (!oneOf(LEDGER_PERIODS, o.period)) return null;
  if (o.locale !== "ko" && o.locale !== "en") return null;
  const sceneSeq = seq(o.sceneSeq);
  const turnSeq = seq(o.turnSeq);
  if (sceneSeq === null || turnSeq === null) return null;
  const askedLayer = o.askedLayer === null ? null : oneOf(LEDGER_LAYERS, o.askedLayer) ? o.askedLayer : undefined;
  if (askedLayer === undefined) return null;
  if (!oneOf(LEDGER_PROBE_KINDS, o.probeKind)) return null;
  if (o.localGate !== "pass" && o.localGate !== "short" && o.localGate !== "non_answer") return null;
  if (typeof o.answerText !== "string" || o.answerText.length === 0 || o.answerText.length > LEDGER_MAX_ANSWER_LEN) {
    return null;
  }
  if (typeof o.openerUnedited !== "boolean") return null;
  return {
    sessionId,
    period: o.period,
    locale: o.locale,
    sceneSeq,
    turnSeq,
    askedLayer,
    probeKind: o.probeKind,
    localGate: o.localGate,
    answerText: o.answerText,
    openerUnedited: o.openerUnedited,
  };
}

/**
 * 모델 출력에서 `answeredLayer` 를 읽는다. 화면(`probe.ts` 의 parseProbeReply ·
 * readAnsweredLayer)과 같은 방식이다: 첫 `{` 부터 마지막 `}` 까지를 JSON 으로 읽고,
 * `"none"` 이면 none, 다섯 층 중 하나면 그 층, 그 밖은 판정 없음(null).
 */
export function readModelLayer(modelText: string): LedgerLayer | "none" | null {
  const match = modelText.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const v = (parsed as { answeredLayer?: unknown }).answeredLayer;
  if (v === "none") return "none";
  return oneOf(LEDGER_LAYERS, v) ? v : null;
}

/** 모델 판정을 원장의 열거값으로. 겨냥한 층이 없으면 판정 대상이 아니다. */
export function judgeVerdict(askedLayer: LedgerLayer | null, modelLayer: LedgerLayer | "none" | null): LedgerVerdict {
  if (askedLayer === null) return "unasked";
  if (modelLayer === null) return "no_verdict";
  if (modelLayer === "none") return "none";
  return modelLayer === askedLayer ? "credited" : "other_layer";
}

/**
 * 보낸 답이 **실제로 모델에 간 프롬프트의 마지막 답인가.**
 *
 * 인터뷰 프롬프트(`probe.ts` buildUserPrompt)는 장면의 턴을 `Q (<층>): ...` / `A (<층>): ...`
 * 줄로 이어 붙여 펜스(`<UNTRUSTED ...>`)로 감싼다. 그래서 마지막 답과 그 층은 펜스가
 * 닫히기 바로 앞의 한 줄이다. 그 줄이 메타의 층 · 답과 글자까지 같을 때만 참이다.
 * 같지 않으면 서버는 문턱을 다시 계산하지 않고 `unverified` 로 적는다(칸이 오르지 않는다).
 */
export function answerTailMatches(
  userText: string,
  askedLayer: LedgerLayer | null,
  answerText: string,
  sanitize: (s: string) => string,
): boolean {
  const line = sanitize(`A (${askedLayer ?? "choice"}): ${answerText}`);
  return userText.endsWith(`\n${line}</UNTRUSTED>`);
}

/** 원장 한 행(0220 `record_interview_probe_verdict` 의 인자). 원문 · 해시가 없다. */
export interface VerdictLedgerRow {
  sessionId: string;
  period: LedgerPeriod;
  locale: LedgerLocale;
  sceneSeq: number;
  turnSeq: number;
  askedLayer: LedgerLayer | null;
  probeKind: LedgerProbeKind;
  localGate: LedgerLocalGate;
  modelLayer: LedgerLayer | null;
  verdict: LedgerVerdict;
  openerUnedited: boolean;
  answerLenBucket: number | null;
}

export interface VerdictLedgerDeps {
  /** `untrusted.ts` 의 sanitizeUntrusted. 프롬프트가 쓴 것과 같은 정리여야 한다. */
  sanitize: (s: string) => string;
  /** `answer-gate.ts` 의 localGate. */
  gate: (text: string, layer: LedgerLayer | null, locale: LedgerLocale) => ClientLocalGate;
  /** `answer-gate.ts` 의 answerLengthBucket. */
  bucket: (text: string) => number;
}

/**
 * 프록시가 원장에 적을 한 행을 만든다. 메타가 어긋나면 null(기록하지 않음).
 *
 * 서버가 **직접 본 것**만 믿는다: 모델 판정은 출력에서 읽고, 로컬 문턱은 프롬프트의
 * 마지막 답과 같다는 것을 확인한 뒤 같은 함수로 다시 계산한다. 클라이언트가 보낸 층 ·
 * 질문 종류 · 장면 번호는 형식과 허용값만 검사한다(설계 3.1: 프롬프트를 클라이언트가
 * 만드는 한 완전한 증명은 아니다).
 */
export function buildVerdictLedgerRow(
  rawMeta: unknown,
  userText: string,
  modelText: string,
  deps: VerdictLedgerDeps,
): VerdictLedgerRow | null {
  const meta = readInterviewTurnMeta(rawMeta);
  if (!meta) return null;
  const verified = answerTailMatches(userText, meta.askedLayer, meta.answerText, deps.sanitize);
  let localGate: LedgerLocalGate = "unverified";
  let answerLenBucket: number | null = null;
  if (verified) {
    const recomputed = deps.gate(meta.answerText, meta.askedLayer, meta.locale);
    localGate = recomputed === meta.localGate ? recomputed : "mismatch";
    answerLenBucket = deps.bucket(meta.answerText);
  }
  const judged = readModelLayer(modelText);
  return {
    sessionId: meta.sessionId,
    period: meta.period,
    locale: meta.locale,
    sceneSeq: meta.sceneSeq,
    turnSeq: meta.turnSeq,
    askedLayer: meta.askedLayer,
    probeKind: meta.probeKind,
    localGate,
    modelLayer: judged === "none" ? null : judged,
    verdict: judgeVerdict(meta.askedLayer, judged),
    openerUnedited: meta.openerUnedited,
    answerLenBucket,
  };
}

/** 원장 함수의 인자 이름. 0220 의 `record_interview_probe_verdict` 선언과 같은 순서다. */
export function verdictRpcArgs(userId: string, auditId: string, row: VerdictLedgerRow): Record<string, unknown> {
  return {
    p_user_id: userId,
    p_audit_id: auditId,
    p_session_id: row.sessionId,
    p_period: row.period,
    p_locale: row.locale,
    p_scene_seq: row.sceneSeq,
    p_turn_seq: row.turnSeq,
    p_asked_layer: row.askedLayer,
    p_probe_kind: row.probeKind,
    p_local_gate: row.localGate,
    p_model_layer: row.modelLayer,
    p_verdict: row.verdict,
    p_opener_unedited: row.openerUnedited,
    p_answer_len_bucket: row.answerLenBucket,
  };
}

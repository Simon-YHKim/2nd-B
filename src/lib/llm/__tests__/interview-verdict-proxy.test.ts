// openai-proxy 의 판정 원장 쓰기(0220, supabase/functions/_shared/interview-verdict.ts).
//
// 프록시 파일은 Deno 용 `.ts` 경로로 src 모듈을 읽어서 jest 가 그대로 못 부른다. 그래서
// polaris-server.test.ts 와 같은 방식으로 원본을 옮겨 적재하고, 그 `.ts` 경로를 실제 src
// 모듈로 이어 준다 -- 프록시가 쓰는 문턱 · 정리 함수가 앱과 같은 것인지까지 함께 본다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import * as gate from "../../interview/answer-gate";
import * as ledger from "../../interview/verdict-ledger";
import * as untrusted from "../untrusted";

const ROOT = resolve(__dirname, "../../../..");
const adapterSource = readFileSync(resolve(ROOT, "supabase/functions/_shared/interview-verdict.ts"), "utf8");
const proxySource = readFileSync(resolve(ROOT, "supabase/functions/openai-proxy/index.ts"), "utf8").replace(/\r\n/g, "\n");

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
type Api = {
  recordInterviewVerdict: (rpc: Rpc, input: {
    userId: string; auditId: string; audited: boolean; rawMeta: unknown; userText: string; modelText: string;
  }) => Promise<"recorded" | "skipped" | "failed">;
};

const required: string[] = [];
const api = {} as Api;
new Function("exports", "require", ts.transpileModule(adapterSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(api, (name: string) => {
  required.push(name);
  if (name.endsWith("/answer-gate.ts")) return gate;
  if (name.endsWith("/verdict-ledger.ts")) return ledger;
  if (name.endsWith("/untrusted.ts")) return untrusted;
  throw new Error(`unexpected import ${name}`);
});

const META = {
  sessionId: "4f1d2c3b-5a69-4e7d-8c1b-0a2b3c4d5e6f",
  period: "school",
  locale: "ko",
  sceneSeq: 2,
  turnSeq: 3,
  askedLayer: "feeling",
  probeKind: "drill",
  localGate: "pass",
  answerText: "무서웠어",
  openerUnedited: true,
};
const USER = '<UNTRUSTED type="interview_transcript">Q (feeling): 그때 어땠어요?\nA (feeling): 무서웠어</UNTRUSTED>';

describe("recordInterviewVerdict", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => undefined); });
  afterEach(() => warn.mockRestore());

  it("읽는 모듈은 앱과 같은 src 파일 셋이다", () => {
    expect(required.map((n) => n.replace(/^.*\/src\//, "src/"))).toEqual([
      "src/lib/interview/answer-gate.ts",
      "src/lib/interview/verdict-ledger.ts",
      "src/lib/llm/untrusted.ts",
    ]);
    for (const n of required) expect(n.startsWith("../../../src/")).toBe(true);
  });

  it("감사 행이 있는 판정 호출 한 번이 원장 한 행이 된다(원문 없음)", async () => {
    const rpc = jest.fn<ReturnType<Rpc>, Parameters<Rpc>>().mockResolvedValue({ data: "recorded", error: null });
    const outcome = await api.recordInterviewVerdict(rpc, {
      userId: "u1", auditId: "a1", audited: true, rawMeta: META, userText: USER,
      modelText: '{"answeredLayer":"feeling","question":"그 뒤엔요?"}',
    });
    expect(outcome).toBe("recorded");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("record_interview_probe_verdict");
    expect(args).toEqual({
      p_user_id: "u1", p_audit_id: "a1", p_session_id: META.sessionId, p_period: "school", p_locale: "ko",
      p_scene_seq: 2, p_turn_seq: 3, p_asked_layer: "feeling", p_probe_kind: "drill", p_local_gate: "pass",
      p_model_layer: "feeling", p_verdict: "credited", p_opener_unedited: true, p_answer_len_bucket: 0,
    });
    expect(JSON.stringify(args)).not.toContain("무서웠어");
  });

  it.each([
    ["감사 행이 없다", { audited: false }],
    ["메타가 없다(옛 앱)", { rawMeta: undefined }],
    ["메타가 어긋났다", { rawMeta: { ...META, period: "teens" } }],
  ])("%s -> 쓰지 않는다", async (_label, patch) => {
    const rpc = jest.fn();
    const outcome = await api.recordInterviewVerdict(rpc, {
      userId: "u1", auditId: "a1", audited: true, rawMeta: META, userText: USER, modelText: "{}", ...patch,
    });
    expect(outcome).toBe("skipped");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("운영에 함수가 없거나(오류) 던져도 응답을 막지 않는다", async () => {
    const failing = jest.fn().mockResolvedValue({ data: null, error: { message: "function not found" } });
    await expect(api.recordInterviewVerdict(failing, {
      userId: "u1", auditId: "a1", audited: true, rawMeta: META, userText: USER, modelText: "{}",
    })).resolves.toBe("failed");
    const throwing = jest.fn().mockRejectedValue(new Error("network"));
    await expect(api.recordInterviewVerdict(throwing, {
      userId: "u1", auditId: "a1", audited: true, rawMeta: META, userText: USER, modelText: "{}",
    })).resolves.toBe("failed");
    // 로그에 원문 · 메타를 남기지 않는다.
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toContain("무서웠어");
  });
});

describe("openai-proxy 배선", () => {
  it("interview_probe 좌석에서만, 동의 재확인을 통과한 뒤, 성공 응답 직전에 쓴다", () => {
    expect(proxySource).toContain("import { recordInterviewVerdict } from '../_shared/interview-verdict.ts';");
    const recheck = proxySource.indexOf("const consentDenial = await recheckLlmConsent(capacityRpc, consentLease);");
    const call = proxySource.indexOf("await recordInterviewVerdict(capacityRpc, {");
    const success = proxySource.indexOf("return jsonResponse(req, { text, modelUsed, latencyMs, audited });");
    expect(recheck).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(recheck);
    expect(success).toBeGreaterThan(call);
    const block = proxySource.slice(proxySource.lastIndexOf("if (", call), success);
    expect(block).toContain("if (purpose === 'interview_probe') {");
    expect(block).toContain("auditId: consentAuditId,");
    expect(block).toContain("audited,");
    expect(block).toContain("rawMeta: body?.interviewTurn,");
    expect(block).toContain("modelText: text,");
    expect(proxySource.match(/recordInterviewVerdict\(/g)).toHaveLength(1);
  });
});

// classifyViaProxy wire-contract pin (cowork 발주2, 2026-07-21). The D4
// server-side classifier used to send NO model and NO effort, so the proxy
// defaulted to old-gen gemini-2.5-flash at effort high (2048 thinking tokens)
// for a one-sentence JSON classification — wrong generation, base-key
// attribution, wasted thinking. These tests pin the fixed body shape so the
// defect cannot silently return.
//
// T1 stage A (2026-08-31): an UNSET EXPO_PUBLIC_SAFETY_VENDOR now resolves
// "openai" (routing.ts RETIRED_DEFAULT), so the default wire is openai-proxy
// with no model hint (openai-proxy seats safety_classify server-side). The
// gemini-proxy + MODELS.flash pin below is kept as the explicit-"gemini"
// rollback case; it is no longer what unset means.

const invokeMock = jest.fn<Promise<{ data: unknown; error: unknown }>, [string, { body: Record<string, unknown> }]>();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: invokeMock } }),
}));
jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));
// live + !vertex → getFlashClient() returns null (H4 cost guard), which is the
// exact production posture where classifyViaProxy is the only semantic path.
jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_LLM_MODE: "live",
    EXPO_PUBLIC_USE_VERTEX: false,
  }),
}));

import { classifySafety } from "../safety";
import { MODELS } from "../types";

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SERVER_SAFETY;
  delete process.env.EXPO_PUBLIC_SAFETY_VENDOR;
});

describe("classifyViaProxy wire contract (D4 seat)", () => {
  it("unset safety vendor routes to openai-proxy at low effort with no model hint", async () => {
    process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
    invokeMock.mockResolvedValue({
      data: { text: '{"zone":"green","triggers":[],"confidence":0.9}' },
      error: null,
    });
    const r = await classifySafety("오늘 산책을 했다", "ko");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fn, { body }] = invokeMock.mock.calls[0];
    expect(fn).toBe("openai-proxy");
    expect(body.purpose).toBe("safety_classify");
    // The flash model is a Gemini-only hint; openai-proxy owns its model
    // server-side, so the body must not carry one (safety.ts vendor guard).
    expect(body).not.toHaveProperty("model");
    expect(body.effort).toBe("low");
    expect(r.zone).toBe("green");
    expect(r.source).toBe("lexicon+llm");
  });

  it("explicit gemini still pins gemini-proxy + env-routed flash model + low effort (rollback)", async () => {
    // explicit: unset is openai since T1 stage A
    process.env.EXPO_PUBLIC_SAFETY_VENDOR = "gemini";
    process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
    invokeMock.mockResolvedValue({
      data: { text: '{"zone":"green","triggers":[],"confidence":0.9,"cssrsLevel":null}' },
      error: null,
    });
    const r = await classifySafety("오늘 산책을 했다", "ko");
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fn, { body }] = invokeMock.mock.calls[0];
    expect(fn).toBe("gemini-proxy");
    expect(body.purpose).toBe("safety_classify");
    expect(body.model).toBe(MODELS.flash);
    expect(body.effort).toBe("low");
    expect(r.zone).toBe("green");
    expect(r.source).toBe("lexicon+llm");
  });

  it("stays lexicon-only (no proxy call) when the D4 flag is off", async () => {
    const r = await classifySafety("오늘 산책을 했다", "ko");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(r.source).toBe("lexicon-fallback");
  });

  it("sends NO union type in the schema (Gemini REST 400s on [number,null] - live-reproduced)", async () => {
    process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
    invokeMock.mockResolvedValue({
      data: { text: '{"zone":"green","triggers":[],"confidence":0.9}' },
      error: null,
    });
    await classifySafety("오늘 산책을 했다", "ko");
    const [, { body }] = invokeMock.mock.calls[0];
    // 2026-08-17: 등급을 아예 요구하지 않는다. 스키마에 자리가 없어야 한다.
    const schema = body.responseSchema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).not.toContain("cssrsLevel");
    expect(JSON.stringify(body.responseSchema)).not.toContain('["number","null"]');
  });

  it("모델이 등급을 자진해서 보내와도 결과에 싣지 않는다", async () => {
    process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
    invokeMock.mockResolvedValue({
      // Verbatim shape observed live 2026-07-21 (benign walk note).
      data: { text: '{"zone":"green","triggers":[],"confidence":1.0,"cssrsLevel":6}' },
      error: null,
    });
    const r = await classifySafety("오늘 산책을 했다", "ko");
    expect(r.zone).toBe("green");
    // 스키마에서 뺐어도 모델은 여분 필드를 얹어 보낼 수 있다. 우리가
    // 그것을 파싱해 되살리지 않는다는 것이 이 검사의 요지다.
    expect(r).not.toHaveProperty("cssrsLevel");
  });
});

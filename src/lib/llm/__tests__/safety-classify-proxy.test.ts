// classifyViaProxy wire-contract pin (cowork 발주2, 2026-07-21). The D4
// server-side classifier used to send NO model and NO effort, so the proxy
// defaulted to old-gen gemini-2.5-flash at effort high (2048 thinking tokens)
// for a one-sentence JSON classification — wrong generation, base-key
// attribution, wasted thinking. These tests pin the fixed body shape so the
// defect cannot silently return.

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
});

describe("classifyViaProxy wire contract (D4 seat)", () => {
  it("pins the env-routed flash model + low effort on the safety_classify body", async () => {
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
    const schema = body.responseSchema as { properties: { cssrsLevel: { type: unknown } } };
    expect(schema.properties.cssrsLevel.type).toBe("number");
    expect(JSON.stringify(body.responseSchema)).not.toContain('["number","null"]');
  });

  it("nulls a junk cssrsLevel on a non-red verdict (live green emitted level 6)", async () => {
    process.env.EXPO_PUBLIC_SERVER_SAFETY = "true";
    invokeMock.mockResolvedValue({
      // Verbatim shape observed live 2026-07-21 (benign walk note).
      data: { text: '{"zone":"green","triggers":[],"confidence":1.0,"cssrsLevel":6}' },
      error: null,
    });
    const r = await classifySafety("오늘 산책을 했다", "ko");
    expect(r.zone).toBe("green");
    expect(r.cssrsLevel).toBeNull();
  });
});

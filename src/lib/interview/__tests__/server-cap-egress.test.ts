// 인터뷰 질문은 live 에서 늘 서버 한도를 지나간다 (게이트 F2049-04).
//
// 12턴 상한을 없앤 근거(Q-261004-24)는 "비용은 서버의 사용자별 몫 · 하루 지출 한도가
// 막는다" 였다. 그런데 경계 모듈에는 그 한도를 안 지나는 길이 하나 있었다: Edge 를
// 끄고 Vertex 를 켠 live 구성에서 Gemini 좌석은 `@google/genai` 를 직접 부르고,
// `assertDirectEgressAllowed` 는 Vertex 를 면제한다. 그 구성에서는 429 가 오지 않으니
// 인터뷰가 끝나지 않고, 유효한 답이 오가는 한 로컬 무응답 가드도 걸리지 않는다.
//
// 그래서 지킨다:
//   1. live 의 interview_probe 는 Vertex 구성에서도 프록시로 간다(직접 호출 0회).
//   2. 그 길의 429 는 그대로 "오늘은 여기까지" 로 읽힌다 -- 끝맺음이 한도에 묶인다.
//   3. 프록시 길에서도 출력 재분류 · 교체는 그대로다.
//   4. 대조군: 같은 구성에서 다른 목적은 여전히 직접 길이다. 이게 없으면 1 의
//      "직접 호출 0회" 가 구성이 애초에 직접 길에 닿지 않아서일 수도 있다.

const mockInvoke = jest.fn();
const mockGenerateContent = jest.fn();
const mockClassifySafety = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mockInvoke } }),
}));

jest.mock("../../supabase/audit", () => ({
  insertAiAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../supabase/crisis-events", () => ({
  insertCrisisEvent: jest.fn().mockResolvedValue(undefined),
}));

// 출력 분류기만 바꾼다. Vertex 구성에서는 진짜 분류기도 generateContent 를 부르므로,
// 그대로 두면 "직접 호출 0회" 를 셀 수가 없다.
jest.mock("../../llm/safety", () => {
  const actual = jest.requireActual("../../llm/safety");
  return { ...actual, classifySafety: (...args: unknown[]) => mockClassifySafety(...args) };
});

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "live",
    // 게이트가 짚은 구성: Edge 꺼짐 + Vertex 켜짐.
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: false,
    EXPO_PUBLIC_USE_VERTEX: true,
    GOOGLE_CLOUD_PROJECT: "test-project",
    GOOGLE_CLOUD_LOCATION: "us-central1",
    GOOGLE_API_KEY: undefined,
    SENTRY_DSN: undefined,
  }),
}));

import { FunctionsHttpError } from "@supabase/supabase-js";

import { callLlm } from "../../llm/boundary";
import { INTERVIEW_PURPOSE, readDayLimitRefusal } from "../session-end";
import { emptyCoverage, nextProbe, type InterviewTurn } from "../probe";

const GREEN = {
  zone: "green" as const,
  triggers: [] as string[],
  confidence: 0.4,
  cssrsLevel: null,
  source: "llm" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};
const RED = {
  zone: "red" as const,
  triggers: ["active_ideation_no_method"],
  confidence: 0.97,
  cssrsLevel: 3 as const,
  source: "llm" as const,
  routingTemplateVersion: "rcv1-2026-05-25",
};

const turns: InterviewTurn[] = [
  { role: "interviewer", text: "What do you remember?", layer: "fact", period: "school" },
  { role: "user", text: "I walked to school with my brother every morning.", layer: "fact", period: "school" },
];

function refusal(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

// 이 목적들이 따르는 벤더 스위치. Gemini 좌석이어야 직접 길이 후보가 된다
// (T1 1단계 뒤 미설정은 openai 라 처음부터 프록시로 간다). 재시도 스위치는 꺼 둔다.
const PINNED = { EXPO_PUBLIC_BACKBONE_VENDOR: "gemini", EXPO_PUBLIC_FAILOVER_VENDOR: undefined } as const;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [key, value] of Object.entries(PINNED)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(() => {
  for (const key of Object.keys(PINNED)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockGenerateContent.mockReset();
  mockClassifySafety.mockReset();
  mockClassifySafety.mockResolvedValue(GREEN);
});

describe("live interview_probe 는 Vertex 구성에서도 서버 한도를 지난다", () => {
  it("직접 호출 없이 프록시로 가고, 그 프록시 429 가 끝맺음으로 읽힌다", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: refusal(429, { error: "purpose_limit_exceeded", feature: INTERVIEW_PURPOSE }),
    });
    let thrown: unknown = null;
    try {
      await nextProbe("u1", "en", "school", turns, emptyCoverage(), false);
    } catch (error) {
      thrown = error;
    }
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("gemini-proxy");
    expect(mockInvoke.mock.calls[0]?.[1]?.body?.purpose).toBe(INTERVIEW_PURPOSE);
    await expect(readDayLimitRefusal(thrown, INTERVIEW_PURPOSE)).resolves.toBe(true);
  });

  it("하루 지출 한도 거절도 같은 길로 온다", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: refusal(429, { error: "daily_limit_exceeded" }) });
    const thrown = await nextProbe("u1", "en", "school", turns, emptyCoverage(), false).then(
      () => null,
      (error: unknown) => error,
    );
    expect(mockGenerateContent).not.toHaveBeenCalled();
    await expect(readDayLimitRefusal(thrown, INTERVIEW_PURPOSE)).resolves.toBe(true);
  });

  it("프록시 길에서도 위험한 출력은 고정 안내로 바뀐다", async () => {
    mockInvoke.mockResolvedValue({
      data: { text: "Maybe it would be easier for everyone if you just slipped away quietly.", modelUsed: "m" },
      error: null,
    });
    mockClassifySafety.mockResolvedValueOnce(RED);
    const r = await callLlm({
      userId: "u1",
      locale: "en",
      purpose: "interview_probe",
      user: "Today I planned my week and it felt productive.",
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(r.text).not.toMatch(/slipped away/i);
    expect(r.safety.zone).toBe("red");
  });
});

describe("대조군: 같은 구성에서 다른 목적은 여전히 직접 길이다", () => {
  it("import_ingest 는 generateContent 를 부르고 프록시를 안 부른다", async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: "ok" });
    await callLlm({ userId: "u1", locale: "en", purpose: "import_ingest", user: "A note about my week." });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

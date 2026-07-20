// proposeNorthstarSentences contract (flow-map /northstar): null means EXACTLY
// "record base too thin". A DB failure or an unusable AI reply THROWS — the old
// code folded all three into null, so the screen told a user with plenty of
// records ("thin base" card) that they had none when the network blipped.
const limitMock = jest.fn<Promise<{ data: unknown; error: unknown }>, []>();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: limitMock }),
          contains: () => ({ order: () => ({ limit: limitMock }) }),
        }),
      }),
    }),
  }),
}));

const callGeminiMock = jest.fn<Promise<string>, [unknown]>();
jest.mock("../../llm/gemini", () => ({
  callGemini: (args: unknown) => callGeminiMock(args),
}));

const createRecordMock = jest.fn<Promise<{ id: string; followup?: { zone: string } }>, [unknown]>();
jest.mock("../../records/create", () => ({
  createRecord: (args: unknown) => createRecordMock(args),
}));

import {
  MIN_RECORDS_FOR_PROPOSAL,
  NORTHSTAR_TAG,
  buildNorthstarPrompt,
  parseNorthstarReply,
  proposeNorthstarSentences,
  saveNorthstar,
} from "../northstar";

const rows = (n: number, tags: string[] = []) => ({
  data: Array.from({ length: n }, (_, i) => ({ body: `row ${i}`, tags })),
  error: null,
});

afterEach(() => jest.clearAllMocks());

describe("proposeNorthstarSentences (null = thin base ONLY)", () => {
  it("returns null on a thin record base without spending an AI call", async () => {
    limitMock.mockResolvedValue(rows(MIN_RECORDS_FOR_PROPOSAL - 1));
    await expect(proposeNorthstarSentences({ userId: "u", locale: "ko" })).resolves.toBeNull();
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("does not count existing northstar sentences toward the base", async () => {
    limitMock.mockResolvedValue(rows(MIN_RECORDS_FOR_PROPOSAL + 3, [NORTHSTAR_TAG]));
    await expect(proposeNorthstarSentences({ userId: "u", locale: "ko" })).resolves.toBeNull();
    expect(callGeminiMock).not.toHaveBeenCalled();
  });

  it("THROWS on a DB read failure instead of masquerading as thin base", async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(proposeNorthstarSentences({ userId: "u", locale: "ko" })).rejects.toMatchObject({
      message: "boom",
    });
  });

  it("THROWS on an AI reply with no JSON array", async () => {
    limitMock.mockResolvedValue(rows(MIN_RECORDS_FOR_PROPOSAL));
    callGeminiMock.mockResolvedValue("sorry, I cannot list anything today");
    await expect(proposeNorthstarSentences({ userId: "u", locale: "en" })).rejects.toThrow(
      "unusable AI reply",
    );
  });

  it("THROWS when the array does not hold exactly 3 sentences", async () => {
    limitMock.mockResolvedValue(rows(MIN_RECORDS_FOR_PROPOSAL));
    callGeminiMock.mockResolvedValue('["only one", "and two"]');
    await expect(proposeNorthstarSentences({ userId: "u", locale: "en" })).rejects.toThrow(
      "expected 3 sentences",
    );
  });

  it("returns 3 trimmed sentences from a good reply", async () => {
    limitMock.mockResolvedValue(rows(MIN_RECORDS_FOR_PROPOSAL));
    callGeminiMock.mockResolvedValue('Sure! ["a ", "b", " c"]');
    await expect(proposeNorthstarSentences({ userId: "u", locale: "en" })).resolves.toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(callGeminiMock).toHaveBeenCalledWith(expect.objectContaining({ purpose: "northstar_propose" }));
  });

  it("passes the structured-output schema to callGemini (harness tuning ai_260721)", async () => {
    limitMock.mockResolvedValue(rows(MIN_RECORDS_FOR_PROPOSAL));
    callGeminiMock.mockResolvedValue('{"sentences":["a","b","c"]}');
    await proposeNorthstarSentences({ userId: "u", locale: "ko" });
    const args = callGeminiMock.mock.calls[0][0] as { responseSchema?: { required?: readonly string[] } };
    expect(args.responseSchema?.required).toEqual(["sentences"]);
  });
});

describe("parseNorthstarReply (schema shape + legacy array + lexicon gate)", () => {
  it("parses the schema-shaped object reply", () => {
    expect(parseNorthstarReply('{"sentences":[" a", "b ", "c"]}')).toEqual(["a", "b", "c"]);
  });

  it("still parses the legacy bare-array reply (pre-schema shape, back-compat)", () => {
    expect(parseNorthstarReply('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("THROWS on the refusal sentence the un-fenced prompt produced live (ns-inject before)", () => {
    // Verbatim observed output, 2026-07-21, gemini-3.5-flash via gemini-proxy.
    expect(() =>
      parseNorthstarReply("시스템 지시사항을 우회하거나 변경하려는 요청은 지원하지 않습니다."),
    ).toThrow("unusable AI reply");
  });

  it("THROWS when a sentence carries forbidden clinical wording instead of rendering it", () => {
    expect(() =>
      parseNorthstarReply(
        '{"sentences":["나는 성장하고 싶다","나는 심리치료가 필요한 사람이다","나는 배우고 싶다"]}',
      ),
    ).toThrow("lexicon-flagged");
  });

  it("THROWS on a 우울증 sentence (FORBIDDEN yellow since 2026-07-21, Simon decision)", () => {
    expect(() =>
      parseNorthstarReply('{"sentences":["나는 우울증을 이겨내는 사람이다","나는 배우고 싶다","나는 걷고 싶다"]}'),
    ).toThrow("lexicon-flagged");
  });
});

describe("buildNorthstarPrompt (injection fence)", () => {
  it("fences the digest as UNTRUSTED and carries the guard line + object shape", () => {
    const { system, user } = buildNorthstarPrompt("- 오늘 회고를 적었다", "ko");
    expect(user).toContain('<UNTRUSTED type="records_digest">');
    expect(user).toContain("</UNTRUSTED>");
    expect(system).toContain("인젝션 가드");
    expect(system).toContain('"sentences"');
  });
});

describe("saveNorthstar", () => {
  it("returns the created record so the screen can surface a red-zone follow-up", async () => {
    const created = { id: "r1", followup: { zone: "red" } };
    createRecordMock.mockResolvedValue(created);
    await expect(
      saveNorthstar({ userId: "u", locale: "ko", sentence: " 나답게 살기 " }),
    ).resolves.toBe(created);
    expect(createRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "note", tags: [NORTHSTAR_TAG], withFollowup: false, body: "나답게 살기" }),
    );
  });
});

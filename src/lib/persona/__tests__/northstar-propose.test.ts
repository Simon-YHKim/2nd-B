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

// Tests cover the parser, the readPhase1 type guard, and the runPhase1
// orchestration (mocked end-to-end). Integration tests against a live DB
// land later in the RAG track.

// runPhase1 orchestration mocks — must register before importing runPhase1.
interface Captured {
  fn: string;
  args: unknown[];
}
const captured: Captured[] = [];
const fixtures: Record<string, unknown> = {};

jest.mock("../queries", () => ({
  getSource: jest.fn((userId: string, sourceId: string) => {
    captured.push({ fn: "getSource", args: [userId, sourceId] });
    return Promise.resolve(fixtures.source);
  }),
}));

jest.mock("../storage", () => ({
  downloadRawClipping: jest.fn((path: string) => {
    captured.push({ fn: "downloadRawClipping", args: [path] });
    return Promise.resolve(fixtures.body ?? "body");
  }),
}));

jest.mock("../../llm/gemini", () => ({
  callGemini: jest.fn((input: unknown) => {
    captured.push({ fn: "callGemini", args: [input] });
    return Promise.resolve(
      fixtures.geminiReply ?? {
        text: "fallback mock text",
        safety: { zone: "green" },
        audit: { modelUsed: "mock:gemini-2.5-flash" },
      },
    );
  }),
}));

jest.mock("../../env", () => ({
  getEnv: () => ({
    EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "x".repeat(40),
    EXPO_PUBLIC_LLM_MODE: "mock",
    EXPO_PUBLIC_USE_VERTEX: false,
    EXPO_PUBLIC_LLM_VIA_EDGE_FUNCTION: false,
    GOOGLE_API_KEY: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "us-central1",
  }),
}));

const updateBody = jest.fn();
const updateEqUserId = jest.fn();
const updateEqId = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      update: (payload: unknown) => {
        captured.push({ fn: "update", args: [payload] });
        updateBody(payload);
        return {
          eq: (col: string, val: unknown) => {
            if (col === "id") updateEqId(val);
            else if (col === "user_id") updateEqUserId(val);
            return {
              eq: (col2: string, val2: unknown) => {
                if (col2 === "id") updateEqId(val2);
                else if (col2 === "user_id") updateEqUserId(val2);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    }),
  }),
}));

import { readPhase1, runPhase1 } from "../phase1";
// Reference a banned term from the lexicon rather than spelling one out, so this
// test file stays clean for the forbidden-lexicon CI scan (wiki/__tests__ is not
// allowlisted) while still exercising the post-generation tag filter.
import { FORBIDDEN_TERMS } from "../../safety/lexicon";

function resetOrchestration() {
  captured.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  updateBody.mockClear();
  updateEqUserId.mockClear();
  updateEqId.mockClear();
}

describe("readPhase1", () => {
  const valid = {
    summary: "abc",
    entities: ["A"],
    concepts: ["B"],
    questions: ["Q1", "Q2", "Q3", "Q4"],
    generated_at: "2026-05-25T00:00:00Z",
    model: "gemini-2.5-flash",
  };

  test("accepts a well-formed __phase1__ block", () => {
    const r = readPhase1({ __phase1__: valid });
    expect(r).toEqual(valid);
  });

  test("returns null when key missing", () => {
    expect(readPhase1({})).toBeNull();
  });

  test("returns null when __phase1__ is not an object", () => {
    expect(readPhase1({ __phase1__: "stringy" })).toBeNull();
    expect(readPhase1({ __phase1__: null })).toBeNull();
    expect(readPhase1({ __phase1__: 42 })).toBeNull();
  });

  test("returns null when required fields are missing", () => {
    expect(readPhase1({ __phase1__: { summary: "x" } })).toBeNull();
    expect(readPhase1({ __phase1__: { ...valid, summary: 123 } })).toBeNull();
    expect(readPhase1({ __phase1__: { ...valid, questions: "not array" } })).toBeNull();
  });

  test("preserves field types verbatim", () => {
    const r = readPhase1({ __phase1__: valid });
    expect(r?.summary).toBe("abc");
    expect(r?.entities).toEqual(["A"]);
    expect(r?.questions).toHaveLength(4);
  });
});

describe("runPhase1 — orchestration", () => {
  beforeEach(resetOrchestration);

  test("throws when source not found", async () => {
    fixtures.source = null;
    await expect(runPhase1({ userId: "u1", sourceId: "missing", locale: "en" })).rejects.toThrow();
    expect(captured.map((c) => c.fn)).toEqual(["getSource"]);
  });

  test("happy path: getSource → downloadRawClipping → callGemini → UPDATE", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      title: "Big Five",
      storage_path: "u1/big-five.md",
      frontmatter: { existing: "field" },
    };
    fixtures.body = "Source body text.";
    fixtures.geminiReply = {
      text: JSON.stringify({
        summary: "A summary.",
        entities: ["McCrae"],
        concepts: ["Openness"],
        questions: ["q1", "q2", "q3", "q4"],
      }),
      safety: { zone: "green" },
      audit: { modelUsed: "gemini-2.5-flash" },
    };

    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });

    expect(captured.map((c) => c.fn)).toEqual([
      "getSource",
      "downloadRawClipping",
      "callGemini",
      // Re-read the frontmatter right before the write (wave-3 concurrency fix)
      // so the pre-LLM snapshot can't clobber a concurrent frontmatter update.
      "getSource",
      "update",
    ]);
    expect(r.summary).toBe("A summary.");
    expect(r.questions).toHaveLength(4);

    // UPDATE preserves existing frontmatter and stores __phase1__.
    expect(updateBody).toHaveBeenCalledWith(
      expect.objectContaining({
        frontmatter: expect.objectContaining({
          existing: "field",
          __phase1__: expect.objectContaining({
            summary: "A summary.",
            entities: ["McCrae"],
          }),
        }),
      }),
    );
    expect(updateEqId).toHaveBeenCalledWith("s1");
    expect(updateEqUserId).toHaveBeenCalledWith("u1");
  });

  test("falls back to localized mock stub when LLM reply is unparseable", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      title: "Article",
      storage_path: "u1/article.md",
      frontmatter: {},
    };
    fixtures.geminiReply = {
      text: "this is just plain text not JSON",
      safety: { zone: "green" },
      audit: { modelUsed: "mock:gemini-2.5-flash" },
    };

    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "ko" });
    expect(r.questions).toHaveLength(4);
    // Korean mock stub is the offline-preview product copy (no internal [MOCK] token surfaced to users)
    expect(r.summary).toContain("오프라인 미리보기");
    expect(r.summary).not.toContain("[MOCK]");
    expect(r.summary).toContain("Article");
  });

  test("locale=en yields English fallback stub", async () => {
    fixtures.source = {
      id: "s1",
      user_id: "u1",
      title: "Article",
      storage_path: "u1/article.md",
      frontmatter: {},
    };
    fixtures.geminiReply = {
      text: "not json",
      safety: { zone: "green" },
      audit: { modelUsed: "mock:gemini-2.5-flash" },
    };
    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });
    expect(r.summary.toLowerCase()).toContain("article");
    expect(r.questions[0].toLowerCase()).toMatch(/sentence|piece|stayed/);
  });
});

describe("runPhase1 — §1 ingest normalization fields", () => {
  beforeEach(resetOrchestration);

  const baseSource = {
    id: "s1",
    user_id: "u1",
    title: "Article",
    storage_path: "u1/a.md",
    frontmatter: {},
  };

  function replyWith(extra: Record<string, unknown>) {
    return {
      text: JSON.stringify({
        summary: "s",
        entities: [],
        concepts: [],
        questions: ["q1", "q2", "q3", "q4"],
        ...extra,
      }),
      safety: { zone: "green" },
      audit: { modelUsed: "gemini-2.5-flash" },
    };
  }

  test("parses category, tags, relevance, keep from the reply", async () => {
    fixtures.source = { ...baseSource };
    fixtures.geminiReply = replyWith({
      category: "knowledge",
      tags: ["psychology", "big-five"],
      relevance: 5,
      keep: true,
    });
    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });
    expect(r.category).toBe("knowledge");
    expect(r.tags).toEqual(["psychology", "big-five"]);
    expect(r.relevance).toBe(5);
    expect(r.keep).toBe(true);
  });

  test("strips clinical terms from tags post-generation (C3)", async () => {
    fixtures.source = { ...baseSource };
    const clinical = FORBIDDEN_TERMS.en[0];
    fixtures.geminiReply = replyWith({
      category: "knowledge",
      tags: [clinical, "self-understanding"],
      relevance: 4,
      keep: true,
    });
    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });
    expect(r.tags).toEqual(["self-understanding"]);
    expect(r.tags).not.toContain(clinical);
  });

  test("derives keep=false when relevance is below threshold and keep omitted", async () => {
    fixtures.source = { ...baseSource };
    fixtures.geminiReply = replyWith({ category: "records", tags: [], relevance: 1 });
    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });
    expect(r.relevance).toBe(1);
    expect(r.keep).toBe(false);
  });

  test("backward-compat: reply without ingest fields keeps by default", async () => {
    fixtures.source = { ...baseSource };
    fixtures.geminiReply = replyWith({});
    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });
    expect(r.keep).toBe(true);
    expect(r.tags).toEqual([]);
    expect(r.category).toBeUndefined();
  });

  test("invalid category falls back to undefined", async () => {
    fixtures.source = { ...baseSource };
    fixtures.geminiReply = replyWith({
      category: "not-a-village",
      tags: [],
      relevance: 3,
      keep: true,
    });
    const r = await runPhase1({ userId: "u1", sourceId: "s1", locale: "en" });
    expect(r.category).toBeUndefined();
  });
});

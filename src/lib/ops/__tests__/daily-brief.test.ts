// D-26 A17: ops_daily_brief — parse + build/cache behaviour.

const captured: { fn: string; args: unknown[] }[] = [];
const fixtures: Record<string, unknown> = {};

jest.mock("../../llm/gemini", () => ({
  callGemini: jest.fn((input: unknown) => {
    captured.push({ fn: "callGemini", args: [input] });
    return Promise.resolve(
      fixtures.geminiResult ?? { text: "{}", safety: { zone: "green" }, audit: { modelUsed: "mock" } },
    );
  }),
}));

jest.mock("../../wiki/export", () => ({
  exportUserWiki: jest.fn(() => {
    captured.push({ fn: "exportUserWiki", args: [] });
    return Promise.resolve({ prompt: "wiki body", pageCount: 0, sourceCount: 0, recordCount: 0 });
  }),
}));

// Supabase mock: a select().eq().eq().maybeSingle() reader for the cache, and
// an upsert() writer. The cache row lives in fixtures.cacheRow.
const upserts: unknown[] = [];
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => {
              captured.push({ fn: "select", args: [table] });
              return Promise.resolve({ data: fixtures.cacheRow ?? null, error: null });
            },
          }),
        }),
      }),
      upsert: (payload: unknown, opts: unknown) => {
        upserts.push({ table, payload, opts });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

import {
  buildOpsDailyBrief,
  getOpsDailyBrief,
  parseOpsDailyBrief,
  resetOpsDailyBriefInFlightForTests,
} from "../daily-brief";

function reset() {
  captured.length = 0;
  upserts.length = 0;
  for (const k of Object.keys(fixtures)) delete fixtures[k];
  resetOpsDailyBriefInFlightForTests();
}

describe("parseOpsDailyBrief", () => {
  beforeEach(reset);

  test("keeps only known domain ids and clamps each to <=3 recs", () => {
    const raw = JSON.stringify({
      exercise_routine: [
        { title: "Walk 10 min", reason: "you jog weekly" },
        { title: "Stretch", reason: "desk work" },
        { title: "Stairs", reason: "small win" },
        { title: "Extra", reason: "over the cap" },
      ],
      not_a_domain: [{ title: "x", reason: "y" }],
      reading_list: [{ title: "Finish chapter", reason: "you started a book" }],
    });
    const brief = parseOpsDailyBrief(raw);
    expect(Object.keys(brief).sort()).toEqual(["exercise_routine", "reading_list"]);
    expect(brief.exercise_routine).toHaveLength(3); // capped
    expect(brief.reading_list).toHaveLength(1);
  });

  test("present-empty domains are KEPT (covered-with-nothing != omitted)", () => {
    // The model explicitly returned exercise_routine:[] -> keep it as [] so
    // serveFromDailyBrief serves [] at 0 LLM instead of re-calling every visit.
    const brief = parseOpsDailyBrief(JSON.stringify({ exercise_routine: [], reading_list: [{ title: "t", reason: "r" }] }));
    expect(brief.exercise_routine).toEqual([]);
    expect(brief.reading_list).toHaveLength(1);
  });

  test("omitted domains stay absent (self-correct via on-demand)", () => {
    const brief = parseOpsDailyBrief(JSON.stringify({ reading_list: [{ title: "t", reason: "r" }] }));
    expect(Object.prototype.hasOwnProperty.call(brief, "exercise_routine")).toBe(false);
  });

  test("crisis copy / non-JSON yields {}", () => {
    expect(parseOpsDailyBrief("Please call the hotline, you matter.")).toEqual({});
    expect(parseOpsDailyBrief("")).toEqual({});
  });

  test("fenced JSON object is unwrapped", () => {
    const brief = parseOpsDailyBrief('```json\n{"daily_focus":[{"title":"Plan day","reason":"you list todos"}]}\n```');
    expect(brief.daily_focus).toHaveLength(1);
  });
});

describe("getOpsDailyBrief", () => {
  beforeEach(reset);

  test("returns null when no row today", async () => {
    expect(await getOpsDailyBrief("u1")).toBeNull();
  });

  test("returns the cached brief object", async () => {
    fixtures.cacheRow = { brief: { exercise_routine: [{ title: "t", reason: "r" }] } };
    const brief = await getOpsDailyBrief("u1");
    expect(brief?.exercise_routine).toHaveLength(1);
  });

  test("a non-object brief column is treated as null", async () => {
    fixtures.cacheRow = { brief: "corrupt" };
    expect(await getOpsDailyBrief("u1")).toBeNull();
  });
});

describe("buildOpsDailyBrief", () => {
  beforeEach(reset);

  test("one LLM call for all domains, then upserts the parsed brief", async () => {
    fixtures.geminiResult = {
      text: JSON.stringify({ exercise_routine: [{ title: "Walk", reason: "you jog" }] }),
      safety: { zone: "green" },
      audit: { modelUsed: "mock" },
    };
    const brief = await buildOpsDailyBrief({ userId: "u1", locale: "en", recommendationsPref: true });
    expect(brief.exercise_routine).toHaveLength(1);
    expect(captured.filter((c) => c.fn === "callGemini")).toHaveLength(1);
    const g = captured.find((c) => c.fn === "callGemini")?.args[0] as { purpose: string; user: string };
    expect(g.purpose).toBe("ops_daily_brief");
    expect(g.user).toContain("<UNTRUSTED>"); // snapshot fenced
    expect(upserts).toHaveLength(1);
  });

  test("an empty brief is NOT cached (avoids pinning 'nothing' for the day)", async () => {
    fixtures.geminiResult = { text: "{}", safety: { zone: "green" }, audit: { modelUsed: "mock" } };
    const brief = await buildOpsDailyBrief({ userId: "u1", locale: "en", recommendationsPref: true });
    expect(brief).toEqual({});
    expect(upserts).toHaveLength(0);
  });

  test("concurrent first-load calls share ONE build", async () => {
    fixtures.geminiResult = {
      text: JSON.stringify({ reading_list: [{ title: "Read", reason: "you saved a book" }] }),
      safety: { zone: "green" },
      audit: { modelUsed: "mock" },
    };
    const [a, b] = await Promise.all([
      buildOpsDailyBrief({ userId: "u1", locale: "en", recommendationsPref: true }),
      buildOpsDailyBrief({ userId: "u1", locale: "en", recommendationsPref: true }),
    ]);
    expect(a).toEqual(b);
    expect(captured.filter((c) => c.fn === "callGemini")).toHaveLength(1); // shared
  });

  test("D-2 gate: an opted-out pref builds nothing (no snapshot, no LLM)", async () => {
    const brief = await buildOpsDailyBrief({ userId: "u1", locale: "en", recommendationsPref: false });
    expect(brief).toEqual({});
    expect(captured.filter((c) => c.fn === "callGemini")).toHaveLength(0);
    expect(captured.filter((c) => c.fn === "exportUserWiki")).toHaveLength(0);
  });
});

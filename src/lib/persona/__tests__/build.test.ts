// Tests for buildPersona() (records:select fixtures are in DB order: created_at DESC - buildPersona fetches newest-first and reverses) — verifies that MBTI and ECR-S records are surfaced
// into the PersonaCard, and that traitsSource flips from "heuristic" to "tipi"
// when a TIPI assessment exists. Supabase calls are mocked per-table.
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const tableFixtures: Record<string, QueryResult> = {};
const upsertCalls: { table: string; payload: unknown; opts: unknown }[] = [];
const selectCalls: { table: string; columns: string }[] = [];
type ReadQuery = { table: string; columns: string; filters: [string, unknown][]; tags: string[]; order?: [string, unknown]; limit?: number };
const readQueries: ReadQuery[] = [];
let readOverride: ((query: ReadQuery) => QueryResult | Promise<QueryResult> | undefined) | undefined;
const forbiddenWrite = jest.fn(() => { throw new Error("Read-only loader attempted a mutation"); });

function chainable(result: QueryResult, query: ReadQuery) {
  // Thenable terminus so `await` works regardless of which chain step ends.
  const reply = () => Promise.resolve(readOverride?.(query) ?? result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return chain; },
    contains: (_key: string, tags: string[]) => { query.tags = tags; return chain; },
    order: (key: string, value: unknown) => { query.order = [key, value]; return chain; },
    limit: (count: number) => { query.limit = count; return chain; },
    // maybeSingle unwraps an array fixture to its first row (or null) — the
    // shape the summary-cache read (personas:select) consumes.
    maybeSingle: () =>
      reply().then((r) => ({
        data: Array.isArray(r.data) ? ((r.data as unknown[])[0] ?? null) : r.data,
        error: r.error,
      })),
    then: (...args: Parameters<Promise<QueryResult>["then"]>) => reply().then(...args),
    catch: (...args: Parameters<Promise<QueryResult>["catch"]>) => reply().catch(...args),
    finally: (...args: Parameters<Promise<QueryResult>["finally"]>) => reply().finally(...args),
    insert: forbiddenWrite, update: forbiddenWrite, delete: forbiddenWrite,
  };
  return chain;
}

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selectCalls.push({ table, columns });
        const query: ReadQuery = { table, columns, filters: [], tags: [] };
        readQueries.push(query);
        return chainable(tableFixtures[`${table}:select`] ?? { data: [], error: null }, query);
      },
      upsert: (payload: unknown, opts: unknown) => {
        upsertCalls.push({ table, payload, opts });
        return Promise.resolve({ data: null, error: null });
      },
      insert: forbiddenWrite, update: forbiddenWrite, delete: forbiddenWrite,
    }),
  }),
}));

jest.mock("../../llm/boundary", () => ({
  callLlm: jest.fn(() =>
    Promise.resolve({
      text: "mock summary",
      safety: { zone: "green" },
      audit: { modelUsed: "mock:gemini-2.5-flash" },
    }),
  ),
}));

import {
  __test_scoreFromAnswers,
  buildPersona,
  deriveValues,
  instrumentLabel,
  isMeasuredSource,
  loadCorePersonaSnapshot,
  loadPersonaRatifiableSignals,
  loadPersonaSnapshot,
  loadSelfPortraitSignals,
  personaSummarySig,
  traitConfidenceFor,
  type AuditResponseRow,
} from "../build";
import { callLlm } from "../../llm/boundary";
import { AUDIT_QUESTIONS } from "../../audit/questions";
import { buildIdenDoc } from "../../iden/build-iden";
import { buildIdenExport } from "../../iden/iden-export";

function reset() {
  for (const k of Object.keys(tableFixtures)) delete tableFixtures[k];
  upsertCalls.length = 0;
  selectCalls.length = 0;
  readQueries.length = 0; readOverride = undefined; forbiddenWrite.mockClear();
  (callLlm as jest.Mock).mockClear();
}

describe("traitConfidenceFor (SOKA per-trait confidence)", () => {
  test("bfi → questionnaire / high", () => {
    expect(traitConfidenceFor("bfi", 1)).toEqual({ source: "questionnaire", confidence: "high", observationCount: 1 });
  });
  test("ipip → questionnaire / high (validated instrument, same as bfi)", () => {
    expect(traitConfidenceFor("ipip", 1)).toEqual({ source: "questionnaire", confidence: "high", observationCount: 1 });
  });
  test("heuristic scales confidence with observation count", () => {
    expect(traitConfidenceFor("heuristic", 0)).toMatchObject({ source: "default", confidence: "low", observationCount: 0 });
    expect(traitConfidenceFor("heuristic", 3)).toMatchObject({ source: "journal_text", confidence: "low" });
    expect(traitConfidenceFor("heuristic", 8)).toMatchObject({ source: "journal_text", confidence: "medium" });
    expect(traitConfidenceFor("heuristic", 20)).toMatchObject({ source: "journal_text", confidence: "high", observationCount: 20 });
  });
});

describe("isMeasuredSource / instrumentLabel", () => {
  test("ipip and bfi are measured; heuristic is not", () => {
    expect(isMeasuredSource("ipip")).toBe(true);
    expect(isMeasuredSource("bfi")).toBe(true);
    expect(isMeasuredSource("heuristic")).toBe(false);
  });
  test("instrument label names the instrument (null for heuristic)", () => {
    expect(instrumentLabel("ipip")).toBe("IPIP-NEO-120");
    expect(instrumentLabel("bfi")).toBe("BFI-44");
    expect(instrumentLabel("heuristic")).toBeNull();
  });
});

describe("deriveValues", () => {
  // deriveValues only reads `.prompt`, so cast lightweight rows to the row type.
  function answer(ids: string[]) {
    return AUDIT_QUESTIONS.filter((q) => ids.includes(q.id)).map((q) => ({
      prompt: q.prompt.en,
    })) as unknown as Parameters<typeof deriveValues>[0];
  }

  test("ranks frameworks by answered count, not AUDIT_QUESTIONS declaration order", () => {
    const byFw = new Map<string, string[]>();
    for (const q of AUDIT_QUESTIONS) {
      const a = byFw.get(q.framework) ?? [];
      a.push(q.id);
      byFw.set(q.framework, a);
    }
    const heavy = [...byFw.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const early = AUDIT_QUESTIONS[0].framework; // declared first (sdt:autonomy)
    expect(heavy[0]).not.toBe(early); // precondition: a heavier, later framework exists
    // Answer ALL of the heavy framework + ONE question of the earlier one.
    const values = deriveValues(answer([...heavy[1], byFw.get(early)![0]]));
    expect(values[0]).toBe(heavy[0]); // most-answered wins over declaration order
    expect(values.indexOf(early)).toBeGreaterThan(0); // earlier framework present but not first
  });

  test("returns empty when nothing was answered", () => {
    expect(deriveValues(answer([]))).toEqual([]);
  });
});

describe("loadPersonaRatifiableSignals", () => {
  beforeEach(reset);

  test("reads only the evidence needed by /review without an LLM call or persona write", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          id: "evidence-1",
          prompt: AUDIT_QUESTIONS[0].prompt.en,
          body: JSON.stringify({
            domains: {
              openness: 5,
              conscientiousness: 4,
              extraversion: 3,
              agreeableness: 2,
              neuroticism: 1,
            },
            scores: {
              openness: 1,
              conscientiousness: 1,
              extraversion: 1,
              agreeableness: 1,
              neuroticism: 1,
            },
            facets: { imagination: 5 },
            style: "secure",
            anxiety: 2,
            avoidance: 2,
          }),
          created_at: "2026-08-28T00:00:00Z",
          tags: [],
        },
      ],
      error: null,
    };

    const signals = await loadPersonaRatifiableSignals("u1");

    expect(signals.traitsSource).toBe("ipip");
    expect(signals.attachment?.style).toBe("secure");
    expect(signals.values).toContain(AUDIT_QUESTIONS[0].framework);
    expect(selectCalls).toContainEqual({ table: "records", columns: "prompt" });
    expect(callLlm).not.toHaveBeenCalled();
    expect(upsertCalls).toEqual([]);
  });

  test("propagates a records read failure instead of showing a false empty state", async () => {
    tableFixtures["records:select"] = { data: null, error: { message: "offline" } };

    await expect(loadPersonaRatifiableSignals("u1")).rejects.toMatchObject({ message: "offline" });
    expect(callLlm).not.toHaveBeenCalled();
    expect(upsertCalls).toEqual([]);
  });

  test("review mount keeps candidate reads independent and defers buildPersona to user actions", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const source = readFileSync(
      join(root, "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
      "utf8",
    );
    const reviewStart = source.indexOf("export function DeepSpaceReviewScreen");
    const mountStart = source.indexOf("useEffect(() => {", reviewStart);
    const generateStart = source.indexOf("async function generate", mountStart);
    const wrapper = source.slice(reviewStart, mountStart);
    const mount = source.slice(mountStart, generateStart);

    expect(wrapper).toContain("<DeepSpaceReviewSession");
    expect(wrapper).toContain("key={sessionKey}");
    expect(wrapper).toContain('userId ?? "signed-out"');
    expect(mount).toContain("loadPersonaRatifiableSignals(userId)");
    expect(mount).toContain("Promise.allSettled");
    expect(mount).toContain('legacyResult.status === "fulfilled"');
    expect(mount).toContain('sevenResult.status === "fulfilled"');
    expect(mount).not.toContain("buildPersona(");
    const actions = source.slice(generateStart);
    expect(
      actions.match(/if \(!userId \|\| isMinor === null \|\| loading\) return;/g),
    ).toHaveLength(2);
    expect(actions).toContain("buildPersona(userId, locale, isMinor === true)");
    expect(
      actions.match(
        /disabled=\{loading \|\| ratifyPending \|\| isMinor === null\}/g,
      ),
    ).toHaveLength(2);
  });
});

describe("loadSelfPortraitSignals", () => {
  beforeEach(reset);

  test("reads direct portrait backing signals without requiring a persisted persona", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          prompt: AUDIT_QUESTIONS[0].prompt.en,
          body: JSON.stringify({
            type: "INTJ",
            scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
            style: "secure",
            anxiety: 2.5,
            avoidance: 1.8,
          }),
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
      error: null,
    };

    const signals = await loadSelfPortraitSignals("u1");

    expect(signals.mbti?.type).toBe("INTJ");
    expect(signals.attachment).toEqual({ style: "secure", anxiety: 2.5, avoidance: 1.8 });
    expect(signals.values).toContain(AUDIT_QUESTIONS[0].framework);
    expect(selectCalls.filter((call) => call.table === "records")).toHaveLength(3);
    expect(callLlm).not.toHaveBeenCalled();
    expect(upsertCalls).toEqual([]);
  });
});

describe("Core Brain read-only mount", () => {
  test("an opted-in snapshot guard can reject before any query or synthesis", async () => {
    reset();
    await expect(loadPersonaSnapshot("u1", () => { throw new Error("read no longer owned"); })).rejects.toThrow("read no longer owned");
    expect(selectCalls).toHaveLength(0); expect(upsertCalls).toHaveLength(0); expect(callLlm).not.toHaveBeenCalled();
  });

  beforeEach(reset);

  test("keeps legacy persisted provenance conservative even when latest IPIP values match", async () => {
    tableFixtures["personas:select"] = {
      data: [
        {
          version: 1,
          traits: {
            openness: 1,
            conscientiousness: 0.75,
            extraversion: 0.5,
            agreeableness: 0.25,
            neuroticism: 0,
          },
          values: [AUDIT_QUESTIONS[0].framework],
          patterns: { summary: "saved summary" },
          markdown_export: "saved export",
        },
      ],
      error: null,
    };
    tableFixtures["records:select"] = {
      data: [
        {
          id: "evidence-1",
          prompt: AUDIT_QUESTIONS[0].prompt.en,
          body: JSON.stringify({
            domains: {
              openness: 5,
              conscientiousness: 4,
              extraversion: 3,
              agreeableness: 2,
              neuroticism: 1,
            },
          }),
          created_at: "2026-08-29T00:00:00Z",
          tags: [],
        },
      ],
      error: null,
    };

    const snapshot = await loadPersonaSnapshot("u1");

    expect(snapshot).not.toBeNull();
    if (!snapshot) throw new Error("expected persisted persona snapshot");
    expect(snapshot.traitsSource).toBe("heuristic");
    expect(snapshot.traitConfidence?.openness).toEqual({
      source: "default",
      confidence: "low",
      observationCount: 0,
    });
    expect(snapshot.traits.openness).toBe(1);
    expect(snapshot.values).toContain(AUDIT_QUESTIONS[0].framework);
    expect(snapshot.patterns.summary).toBe("saved summary");
    expect(snapshot.markdownExport).toBe("saved export");
    expect(selectCalls).toContainEqual({
      table: "personas",
      columns: "version, traits, values, patterns, markdown_export",
    });
    expect(callLlm).not.toHaveBeenCalled();
    expect(upsertCalls).toEqual([]);
  });

  test("does not synthesize a persona when no persisted snapshot exists", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          id: "new-evidence",
          prompt: AUDIT_QUESTIONS[0].prompt.en,
          body: "new evidence that has not been rebuilt yet",
          created_at: "2026-08-29T00:00:00Z",
          tags: [],
        },
      ],
      error: null,
    };

    await expect(loadPersonaSnapshot("u1")).resolves.toBeNull();
    expect(callLlm).not.toHaveBeenCalled();
    expect(upsertCalls).toEqual([]);
  });

  test("keeps persisted traits when newer evidence has not been explicitly rebuilt", async () => {
    tableFixtures["personas:select"] = {
      data: [
        {
          version: 1,
          traits: {
            openness: 0.2,
            conscientiousness: 0.2,
            extraversion: 0.2,
            agreeableness: 0.2,
            neuroticism: 0.2,
          },
          values: [],
          patterns: {},
          markdown_export: "",
        },
      ],
      error: null,
    };
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            domains: {
              openness: 5,
              conscientiousness: 4,
              extraversion: 3,
              agreeableness: 2,
              neuroticism: 1,
            },
          }),
          created_at: "2026-08-29T00:00:00Z",
        },
      ],
      error: null,
    };

    const snapshot = await loadPersonaSnapshot("u1");

    expect(snapshot?.traits.openness).toBe(0.2);
    expect(snapshot?.traitsSource).toBe("heuristic");
    expect(callLlm).not.toHaveBeenCalled();
    expect(upsertCalls).toEqual([]);
  });

  test("loads a SELECT-only persona snapshot instead of rebuilding on mount", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const source = readFileSync(join(root, "src/app/core-brain.tsx"), "utf8");
    const reader = readFileSync(join(root, "src/lib/persona/use-core-evidence-read.ts"), "utf8");
    expect(source).toContain("const primaryRead = useCoreEvidenceRead(");
    expect(reader).toContain("await loadCorePersonaSnapshot(owner, requireCurrent)");
    expect(reader).toContain("const fullRead = previous === null");
    expect(reader).not.toContain("buildPersona(");
    expect(reader).not.toMatch(/\.(?:insert|update|upsert|delete)\(/);
  });
});

describe("Polaris companion loader boundaries", () => {
  const traits = { openness: 0.2, conscientiousness: 0.3, extraversion: 0.4, agreeableness: 0.5, neuroticism: 0.6 };
  const row = { version: 1, traits, values: ["saved value", 7], patterns: { summary: "saved summary", discarded: false }, markdown_export: "saved export" };
  const mbti = { type: "INTJ", scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 } };
  const attachment = { style: "secure", anxiety: 2.5, avoidance: 1.8 };
  const current = () => {};
  const readers = [
    { name: "Core projection", load: loadCorePersonaSnapshot },
    { name: "shared snapshot", load: loadPersonaSnapshot },
  ];
  const signal = (query: ReadQuery) => query.columns === "prompt" ? "prompt" : query.tags[0];
  function held() {
    let resolve!: (value: QueryResult) => void;
    const promise = new Promise<QueryResult>(done => { resolve = done; });
    return { promise, resolve };
  }
  async function flush() { for (let i = 0; i < 35; i++) await Promise.resolve(); }
  async function rejectsBeforePeer(work: Promise<unknown>, error: unknown) {
    const settled: unknown[] = [];
    void work.then(value => settled.push({ value }), reason => settled.push({ error: reason }));
    await flush(); expect(settled).toEqual([{ error }]);
  }
  beforeEach(() => { reset(); tableFixtures["personas:select"] = { data: row, error: null }; });
  afterEach(() => {
    expect(callLlm).not.toHaveBeenCalled(); expect(upsertCalls).toEqual([]);
    expect(forbiddenWrite).not.toHaveBeenCalled();
  });

  test("Core projection keeps normalized saved fields and conservative provenance with assessment I/O zero", async () => {
    readOverride = query => {
      if (query.table === "records") throw new Error("Core must not query assessments");
      return undefined;
    };
    const snapshot = await loadCorePersonaSnapshot("owner", current);
    expect(snapshot).toMatchObject({ version: 1, traits, traitsSource: "heuristic", values: ["saved value"], patterns: { summary: "saved summary" }, markdownExport: "saved export" });
    expect(Object.values(snapshot!.traitConfidence!)).toEqual(Array(5).fill({ source: "default", confidence: "low", observationCount: 0 }));
    expect(snapshot).not.toHaveProperty("mbti"); expect(snapshot).not.toHaveProperty("attachment");
    expect(readQueries).toEqual([{ table: "personas", columns: "version, traits, values, patterns, markdown_export", filters: [["user_id", "owner"], ["version", 1]], tags: [] }]);
  });

  test("shared snapshot still waits for its row, then enriches with current MBTI and attachment", async () => {
    const saved = held();
    readOverride = query => query.table === "personas" ? saved.promise : {
      data: [{ body: JSON.stringify(signal(query) === "mbti" ? mbti : attachment) }], error: null,
    };
    const loading = loadPersonaSnapshot("owner");
    await flush(); expect(readQueries.map(query => query.table)).toEqual(["personas"]);
    saved.resolve({ data: row, error: null });
    const snapshot = await loading;
    expect(snapshot).toMatchObject({ mbti, attachment, traitsSource: "heuristic", traits });
    expect(readQueries.map(query => query.table)).toEqual(["personas", "records", "records"]);
    expect(readQueries.slice(1).map(query => ({ filters: query.filters, tags: query.tags, order: query.order, limit: query.limit }))).toEqual([
      { filters: [["user_id", "owner"]], tags: ["mbti", "assessment"], order: ["created_at", { ascending: false }], limit: 1 },
      { filters: [["user_id", "owner"]], tags: ["attachment", "ecr"], order: ["created_at", { ascending: false }], limit: 1 },
    ]);
    readOverride = undefined;
    const core = await loadCorePersonaSnapshot("owner", current);
    const { mbti: measuredMbti, attachment: measuredAttachment, ...savedFields } = snapshot!;
    expect(measuredMbti).toEqual(mbti); expect(measuredAttachment).toEqual(attachment);
    expect(savedFields).toEqual(core);
  });

  test.each(readers)("$name keeps no row distinct from failed reads", async ({ load }) => {
    tableFixtures["personas:select"] = { data: null, error: null };
    await expect(load("owner", current)).resolves.toBeNull();
    const error = { message: "offline" }; tableFixtures["personas:select"] = { data: null, error };
    await expect(load("owner", current)).rejects.toBe(error);
    expect(readQueries.every(query => query.table === "personas")).toBe(true);
  });

  test.each(readers)("$name rejects malformed traits before assessment enrichment", async ({ load }) => {
    for (const invalid of [null, {}, { ...traits, openness: "0.2" }, { ...traits, openness: NaN }, { ...traits, openness: Infinity }]) {
      tableFixtures["personas:select"] = { data: { ...row, traits: invalid }, error: null };
      await expect(load("owner", current)).rejects.toThrow("Invalid persisted persona traits");
    }
    expect(readQueries).toHaveLength(5); expect(readQueries.every(query => query.table === "personas")).toBe(true);
  });

  test.each(readers)("$name keeps stored field normalization for absent optional values", async ({ load }) => {
    tableFixtures["personas:select"] = { data: { version: 1, traits, values: null, patterns: [], markdown_export: 7 }, error: null };
    await expect(load("owner", current)).resolves.toMatchObject({ values: [], patterns: {}, markdownExport: "", traitsSource: "heuristic" });
  });

  test.each(readers)("$name rejects an invalid owner/deadline before the first SELECT", async ({ load }) => {
    const error = new Error("scope expired");
    await expect(load("owner", () => { throw error; })).rejects.toBe(error);
    expect(readQueries).toEqual([]);
  });

  test.each(readers)("$name cannot return a late stored row or start dependent I/O after invalidation", async ({ load }) => {
    const saved = held(); readOverride = query => query.table === "personas" ? saved.promise : undefined;
    let valid = true; const error = new Error("scope expired");
    const loading = load("owner", () => { if (!valid) throw error; });
    await flush(); valid = false; saved.resolve({ data: row, error: null });
    await expect(loading).rejects.toBe(error);
    expect(readQueries.map(query => query.table)).toEqual(["personas"]);
  });

  test("shared snapshot rejects a late enrichment result after invalidation", async () => {
    const assessment = held(); readOverride = query => query.table === "records" ? assessment.promise : undefined;
    let valid = true; const error = new Error("scope expired");
    const loading = loadPersonaSnapshot("owner", () => { if (!valid) throw error; });
    await flush(); expect(readQueries).toHaveLength(3);
    valid = false; assessment.resolve({ data: [], error: null });
    await expect(loading).rejects.toBe(error);
  });

  test.each(["mbti", "attachment"])("shared snapshot retains %s failure while the other enrichment waits", async failed => {
    const error = { message: "assessment offline" };
    readOverride = query => query.table === "records" ? signal(query) === failed ? { data: null, error } : new Promise(() => {}) : undefined;
    await rejectsBeforePeer(loadPersonaSnapshot("owner"), error);
  });

  test.each(["prompt", "mbti", "attachment"])("portrait %s failure rejects before an unresolved peer", async failed => {
    const error = { message: `${failed} offline` };
    readOverride = query => signal(query) === failed ? { data: null, error } : new Promise(() => {});
    await rejectsBeforePeer(loadSelfPortraitSignals("owner"), error);
    expect(readQueries).toHaveLength(3);
  });

  test("portrait still derives successful values with owned bounded newest-first queries", async () => {
    readOverride = query => ({ data: signal(query) === "prompt" ? [{ prompt: AUDIT_QUESTIONS[0].prompt.en }]
      : [{ body: JSON.stringify(signal(query) === "mbti" ? mbti : attachment) }], error: null });
    await expect(loadSelfPortraitSignals("owner", current)).resolves.toEqual({ mbti, attachment, values: [AUDIT_QUESTIONS[0].framework] });
    expect(readQueries).toHaveLength(3);
    expect(readQueries[0]).toEqual({ table: "records", columns: "prompt", filters: [["user_id", "owner"], ["kind", "audit_response"]], tags: [], order: ["created_at", { ascending: false }], limit: 1000 });
    for (const query of readQueries.slice(1)) {
      expect(query.filters).toEqual([["user_id", "owner"]]);
      expect(query.order).toEqual(["created_at", { ascending: false }]); expect(query.limit).toBe(1);
    }
  });

  test("portrait normal absence remains successful empty signals", async () => {
    await expect(loadSelfPortraitSignals("owner", current)).resolves.toEqual({ mbti: null, attachment: null, values: [] });
  });

  test("portrait invalid scope before start performs no SELECT", async () => {
    const error = new Error("scope expired");
    await expect(loadSelfPortraitSignals("owner", () => { throw error; })).rejects.toBe(error);
    expect(readQueries).toEqual([]);
  });

  test.each(["prompt", "mbti", "attachment"])("portrait cannot publish late %s success after invalidation", async pending => {
    const last = held(); readOverride = query => signal(query) === pending ? last.promise : undefined;
    let valid = true; const error = new Error("scope expired");
    const loading = loadSelfPortraitSignals("owner", () => { if (!valid) throw error; });
    await flush(); valid = false; last.resolve({ data: [], error: null });
    await expect(loading).rejects.toBe(error); expect(readQueries).toHaveLength(3);
  });
});

describe("buildPersona", () => {
  beforeEach(reset);

  test("no assessments → heuristic source, mbti/attachment null", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.traitsSource).toBe("heuristic");
    expect(card.mbti).toBeNull();
    expect(card.attachment).toBeNull();
    expect(card.version).toBe(1);
    expect(card.markdownExport).toContain("Persona v1");
    // Phase A: an empty starter card leaves every star dim (L1), Soul Core 0.2.
    expect(card.starLevels?.now).toBe(1);
    expect(card.soulCoreBrightness).toBeCloseTo(0.2);
  });

  test("no written entries → skips LLM summary (no Barnum fabrication), honest empty message", async () => {
    (callLlm as jest.Mock).mockClear();
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    // With zero audit/journal rows there is nothing to summarize: the LLM must
    // not be asked to invent a narrative.
    expect(callLlm).not.toHaveBeenCalled();
    expect(card.patterns.summary).toContain("No written entries yet");
  });

  test("MBTI record present → mbti surfaced + markdown section", async () => {
    // First records:select is the audit_response query; loadLatestMbti also
    // hits records:select. We collapse via a single fixture that returns both
    // shapes the parsers tolerate — audit rows ignore tag fields, MBTI loader
    // ignores rows without parseable body.
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            type: "INTJ",
            scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "ko", false);
    expect(card.mbti).toEqual({
      type: "INTJ",
      scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
    });
    expect(card.markdownExport).toContain("INTJ");
  });

  test("malformed MBTI rows are ignored instead of surfaced as identity truth", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            type: "XXXX",
            scores: { E: 0, I: 4, S: 0, N: 4, T: 4, F: 0, J: 4, P: 0 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.mbti).toBeNull();
    expect(card.markdownExport).not.toContain("## MBTI");
  });

  test("ECR-S attachment record → attachment surfaced + markdown section", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({ style: "secure", anxiety: 2.5, avoidance: 1.8 }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.attachment).toEqual({ style: "secure", anxiety: 2.5, avoidance: 1.8 });
    expect(card.markdownExport).toContain("Attachment style");
    // Phase A: a completed ECR-S lights star5 (관계의 나) to L4.
    expect(card.starLevels?.relational).toBe(4);
  });

  test("BFI record → traitsSource = 'bfi' + neuroticism measured directly (no inversion)", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            scores: {
              openness: 4,
              conscientiousness: 3.5,
              extraversion: 2,
              agreeableness: 4,
              neuroticism: 1.5,
            },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.traitsSource).toBe("bfi");
    // BFI 1-5 → 0-1: norm(v) = (v - 1) / 4
    // neuroticism 1.5 → (1.5 - 1) / 4 = 0.125 — preserved, NOT inverted
    expect(card.traits.neuroticism).toBeCloseTo(0.125, 5);
    expect(card.traits.openness).toBeCloseTo((4 - 1) / 4, 5);
    // Phase A: a validated instrument lights star1 (지금의 나) to L4.
    expect(card.starLevels?.now).toBe(4);
    expect(card.soulCoreBrightness).toBeGreaterThan(0.2);
  });

  test("IPIP-NEO-120 record → traitsSource = 'ipip' + traits from its domain means", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            domains: { openness: 4, conscientiousness: 3.5, extraversion: 2, agreeableness: 4, neuroticism: 1.5 },
            facets: { anxiety: 2, imagination: 5 },
          }),
          created_at: "2026-05-10T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.traitsSource).toBe("ipip");
    // same (v-1)/4 normalize as BFI; neuroticism measured directly (no inversion)
    expect(card.traits.openness).toBeCloseTo((4 - 1) / 4, 5);
    expect(card.traits.neuroticism).toBeCloseTo(0.125, 5);
    // a validated instrument lights star1 (지금의 나) to L4, same as BFI
    expect(card.starLevels?.now).toBe(4);
  });

  test("IPIP outranks BFI when both exist (the more detailed instrument wins)", async () => {
    // One row carries BOTH shapes; the mock returns it to every records query, so
    // loadLatestIpip reads `domains` and loadLatestBfi reads `scores`. IPIP must win.
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            domains: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 },
            facets: { anxiety: 5 },
            scores: { openness: 1, conscientiousness: 1, extraversion: 1, agreeableness: 1, neuroticism: 1 },
          }),
          created_at: "2026-05-10T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.traitsSource).toBe("ipip");
    // IPIP openness 5 → 1.0, NOT BFI's 1 → 0.0
    expect(card.traits.openness).toBeCloseTo(1, 5);
  });

  test("partial BFI score rows are ignored instead of zeroing missing traits", async () => {
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({ scores: { openness: 4 } }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.traitsSource).toBe("heuristic");
    expect(card.traits.conscientiousness).toBeGreaterThan(0);
    expect(card.traitConfidence?.conscientiousness.source).toBe("journal_text");
  });

  test("evidenceRefs = resolvable record refs for the rows the card was built from (0060)", async () => {
    // Audit rows carry ids; buildPersona reads them ascending and exposes the
    // most-recent (bounded, newest-first) as `record:<id>` provenance — the real
    // ids a ratified tier change cites, never an LLM-invented label.
    tableFixtures["records:select"] = {
      data: [
        { id: "bbbbbbbb-2222-2222-2222-222222222222", prompt: "q2", body: "newer entry", created_at: "2026-05-02T00:00:00Z", tags: [] },
        { id: "aaaaaaaa-1111-1111-1111-111111111111", prompt: "q1", body: "older entry", created_at: "2026-05-01T00:00:00Z", tags: [] },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.evidenceRefs).toEqual([
      "record:bbbbbbbb-2222-2222-2222-222222222222",
      "record:aaaaaaaa-1111-1111-1111-111111111111",
    ]);
  });

  test("evidenceRefs is empty for a card with no written entries", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    const card = await buildPersona("u1", "en", false);
    expect(card.evidenceRefs).toEqual([]);
  });

  test("persona row upserted with version 1", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    await buildPersona("u1", "en", false);
    const personaUpsert = upsertCalls.find((c) => c.table === "personas");
    expect(personaUpsert).toBeDefined();
    expect((personaUpsert?.payload as { version: number }).version).toBe(1);
    expect((personaUpsert?.opts as { onConflict: string }).onConflict).toBe("user_id,version");
  });

  test("a persona rebuild keeps previously approved role cards", async () => {
    tableFixtures["records:select"] = { data: [], error: null };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    tableFixtures["personas:select"] = {
      data: [{ patterns: { role_cards_v1: '[{"id":"builder","status":"ratified"}]' } }],
      error: null,
    };
    await buildPersona("u1", "en", false);
    const upsert = upsertCalls.find((call) => call.table === "personas");
    expect((upsert?.payload as { patterns?: Record<string, string> }).patterns?.role_cards_v1)
      .toContain('"status":"ratified"');
  });

  test("C1 contract: a garbage LLM reply never moves persona scores (instrument layer decides)", async () => {
    // BFI present -> traits + star1 come from the validated instrument, not the LLM.
    tableFixtures["records:select"] = {
      data: [
        {
          body: JSON.stringify({
            scores: { openness: 4, conscientiousness: 3.5, extraversion: 2, agreeableness: 4, neuroticism: 1.5 },
          }),
          created_at: "2026-05-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tableFixtures["memorized_patterns:select"] = { data: [], error: null };
    // The LLM tries to inject fabricated scores; the wrapper output must not leak
    // into traits / starLevels (only the narrative summary slot may use it).
    (callLlm as jest.Mock).mockResolvedValueOnce({
      text: '{"openness":99,"neuroticism":1} your score is 200/100, openness 100',
      safety: { zone: "green" },
      audit: { modelUsed: "mock:gemini-2.5-flash" },
    });
    const card = await buildPersona("u1", "en", false);
    // traits stay BFI-derived (norm = (v-1)/4), untouched by the garbage reply.
    expect(card.traitsSource).toBe("bfi");
    expect(card.traits.openness).toBeCloseTo((4 - 1) / 4, 5);
    expect(card.traits.neuroticism).toBeCloseTo(0.125, 5);
    // star1 stays L4 (validated instrument), not inflated by the LLM text.
    expect(card.starLevels?.now).toBe(4);
    // The persona narrative call is now GUIDED: build.ts passes the honest-
    // synthesis system instruction (it was previously unguided).
    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "persona_narrative",
        system: expect.stringContaining("ONLY in the entries"),
      }),
    );
  });

  test("summary cache: fresh signature reuses the stored summary and SKIPS the LLM", async () => {
    const rows = [
      { id: "r2", prompt: "Q2", body: "A2", created_at: "2026-01-03T00:00:00Z", tags: [] },
      { id: "r1", prompt: "Q1", body: "A1", created_at: "2026-01-02T00:00:00Z", tags: [] },
    ];
    tableFixtures["records:select"] = { data: rows, error: null };
    tableFixtures["personas:select"] = {
      data: [
        {
          patterns: {
            summary: "cached mirror",
            __summary_source: "model",
            __summary_sig: personaSummarySig("en", false, 2, "2026-01-03T00:00:00Z"),
          },
        },
      ],
      error: null,
    };
    const card = await buildPersona("u1", "en", false);
    expect(card.patterns.summary).toBe("cached mirror");
    expect(callLlm).not.toHaveBeenCalled();
  });

  test("summary cache: stale signature re-summarizes and persists the fresh sig", async () => {
    const rows = [
      { id: "r2", prompt: "Q2", body: "A2", created_at: "2026-01-05T00:00:00Z", tags: [] },
      { id: "r1", prompt: "Q1", body: "A1", created_at: "2026-01-02T00:00:00Z", tags: [] },
    ];
    tableFixtures["records:select"] = { data: rows, error: null };
    tableFixtures["personas:select"] = {
      data: [
        {
          patterns: {
            summary: "old mirror",
            // Signature from when only one row existed — stale now.
            __summary_sig: personaSummarySig("en", false, 1, "2026-01-02T00:00:00Z"),
          },
        },
      ],
      error: null,
    };
    const card = await buildPersona("u1", "en", false);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(card.patterns.summary).toBe("mock summary");
    expect(card.patterns.__summary_sig).toBe(personaSummarySig("en", false, 2, "2026-01-05T00:00:00Z"));
    const personaUpsert = upsertCalls.find((u) => u.table === "personas");
    expect(
      (personaUpsert?.payload as { patterns?: Record<string, string> })?.patterns?.__summary_sig,
    ).toBe(personaSummarySig("en", false, 2, "2026-01-05T00:00:00Z"));
  });

  // C10 (QA 261004 gate r3, C10-CACHE-001). The summary is crisis-capable: callLlm swaps a
  // red-zone reply for the crisis message of the age it was handed. The cache signature
  // used to sign only locale and rows, so a summary built on adult routing (the export
  // screen left the age out until L1-07) matched a later build for the same minor, and
  // that build reused it without reaching callLlm({ minor: true }).
  describe("summary cache: the age is part of the signature", () => {
    const LAST = "2026-01-03T00:00:00Z";
    const twoRows = () => {
      tableFixtures["records:select"] = {
        data: [
          { id: "r2", prompt: "Q2", body: "A2", created_at: LAST, tags: [] },
          { id: "r1", prompt: "Q1", body: "A1", created_at: "2026-01-02T00:00:00Z", tags: [] },
        ],
        error: null,
      };
    };
    const cached = (sig: string) => {
      tableFixtures["personas:select"] = {
        data: [{ patterns: { summary: "summary on the other age's routing", __summary_sig: sig, __summary_source: "model" } }],
        error: null,
      };
    };
    const storedSig = () =>
      (upsertCalls.find((u) => u.table === "personas")?.payload as { patterns?: Record<string, string> })
        ?.patterns?.__summary_sig;

    test("the same locale and rows sign differently for a minor and an adult", () => {
      expect(personaSummarySig("en", true, 2, LAST)).not.toBe(personaSummarySig("en", false, 2, LAST));
    });

    test("a summary cached for the other age is rebuilt on the age the caller resolved", async () => {
      for (const [cachedMinor, minor] of [
        [false, true],
        [true, false],
      ] as const) {
        reset();
        twoRows();
        cached(personaSummarySig("en", cachedMinor, 2, LAST));
        const card = await buildPersona("u1", "en", minor);
        expect(callLlm).toHaveBeenCalledTimes(1);
        expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "persona_narrative", minor }));
        expect(card.patterns.summary).toBe("mock summary");
        expect(storedSig()).toBe(personaSummarySig("en", minor, 2, LAST));
      }
    });

    test("a summary cached for the same age is still reused", async () => {
      for (const minor of [true, false]) {
        reset();
        twoRows();
        cached(personaSummarySig("en", minor, 2, LAST));
        const card = await buildPersona("u1", "en", minor);
        expect(callLlm).not.toHaveBeenCalled();
        expect(card.patterns.summary).toBe("summary on the other age's routing");
      }
    });

    test("a row cached before the age was signed (v1) misses once for either age", async () => {
      // The exact v1 shape: `v1:<locale>:<rows>:<newest created_at>`, with no age in it.
      for (const minor of [true, false]) {
        reset();
        twoRows();
        cached(`v1:en:2:${LAST}`);
        const card = await buildPersona("u1", "en", minor);
        expect(callLlm).toHaveBeenCalledTimes(1);
        expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "persona_narrative", minor }));
        expect(card.patterns.summary).toBe("mock summary");
        expect(storedSig()).toBe(personaSummarySig("en", minor, 2, LAST));
      }
    });
  });

  test("summary windowing: interview transcripts are excluded and bodies clipped", async () => {
    const longInterview = "T".repeat(4000);
    const rows = [
      { id: "r3", prompt: "Q3", body: "B".repeat(900), created_at: "2026-01-04T00:00:00Z", tags: [] },
      { id: "r2", prompt: "(interview)", body: longInterview, created_at: "2026-01-03T00:00:00Z", tags: ["interview"] },
      { id: "r1", prompt: "Q1", body: "short answer", created_at: "2026-01-02T00:00:00Z", tags: [] },
    ];
    tableFixtures["records:select"] = { data: rows, error: null };
    await buildPersona("u1", "en", false);
    const arg = (callLlm as jest.Mock).mock.calls[0]![0] as { user: string };
    expect(arg.user).not.toContain("TTTT"); // interview body excluded
    expect(arg.user).toContain("short answer");
    // Long non-interview bodies are clipped to the window cap (500 chars).
    expect(arg.user).toContain("B".repeat(500));
    expect(arg.user).not.toContain("B".repeat(501));
  });

  // C10 (QA 261004 gate r2, C10-001): `minor` used to default to false, so a caller that
  // dropped it built a minor's persona on adult crisis routing without any error. The
  // type now requires it, and a value that is not a boolean (a JS caller, an `as` cast)
  // is refused before the first read, so nothing reaches callLlm on a guessed age.
  test("the age is required: a non-boolean minor rejects before any read or LLM call", async () => {
    tableFixtures["records:select"] = {
      data: [{ id: "r1", prompt: "Q1", body: "A1", created_at: "2026-01-02T00:00:00Z", tags: [] }],
      error: null,
    };
    for (const bad of [undefined, null, "true", 0]) {
      selectCalls.length = 0;
      upsertCalls.length = 0;
      (callLlm as jest.Mock).mockClear();
      await expect(buildPersona("u1", "en", bad as unknown as boolean)).rejects.toThrow(TypeError);
      expect(selectCalls).toEqual([]);
      expect(upsertCalls).toEqual([]);
      expect(callLlm).not.toHaveBeenCalled();
    }
  });

  test("the resolved age reaches the persona_narrative call unchanged", async () => {
    for (const minor of [true, false]) {
      reset();
      tableFixtures["records:select"] = {
        data: [{ id: "r1", prompt: "Q1", body: "A1", created_at: "2026-01-02T00:00:00Z", tags: [] }],
        error: null,
      };
      await buildPersona("u1", "en", minor);
      expect(callLlm).toHaveBeenCalledTimes(1);
      expect(callLlm).toHaveBeenCalledWith(expect.objectContaining({ purpose: "persona_narrative", minor }));
    }
  });
});

describe("persona export summary provenance", () => {
  beforeEach(() => {
    reset();
    tableFixtures["records:select"] = {
      data: [{ id: "r1", prompt: "Q", body: "A", created_at: "2026-10-19", tags: [] }], error: null,
    };
  });

  test.each(["red", "green", "yellow"])("%s provenance survives persistence and a cache hit in every export", async (zone) => {
    (callLlm as jest.Mock).mockResolvedValueOnce({ text: "Saved response.", safety: { zone } });
    const fresh = await buildIdenDoc("u1", { locale: "en", minor: false });
    const persisted = upsertCalls.find((u) => u.table === "personas")!.payload as { patterns: Record<string, string> };
    expect(persisted.patterns.__summary_source).toBe(zone === "red" ? "fixed_safety" : "model");
    tableFixtures["personas:select"] = { data: [persisted], error: null };
    const cached = await buildIdenDoc("u1", { locale: "en", minor: false });
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(cached.summary).toEqual(fresh.summary);
    expect((upsertCalls.at(-1)!.payload as typeof persisted).patterns.__summary_source).toBe(persisted.patterns.__summary_source);
    for (const doc of [fresh, cached]) {
      const exported = buildIdenExport(doc, { aiCopyTail: "AI TAIL" });
      for (const artifact of [exported.iden, exported.html, exported.json]) {
        expect(artifact).toContain("Saved response.");
        expect(artifact.includes("AI TAIL")).toBe(zone !== "red");
      }
    }
  });

  test("a legacy cache without summary provenance misses even when its signature matches", async () => {
    tableFixtures["personas:select"] = {
      data: [{ patterns: { summary: "Unknown old response", __summary_sig: personaSummarySig("en", false, 1, "2026-10-19") } }], error: null,
    };
    const card = await buildPersona("u1", "en", false);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(card.patterns.__summary_source).toBe("model");
    expect(card.patterns.summary).toBe("mock summary");
  });
});

describe("scoreFromAnswers locale-aware keyword matching", () => {
  const row = (body: string): AuditResponseRow => ({
    id: "r",
    prompt: null,
    body,
    created_at: "2026-01-01T00:00:00Z",
    tags: null,
  });

  // Regression: markers were \b-wrapped, and \b is defined against \w=[A-Za-z0-9_],
  // so Hangul had no word boundary and Korean keywords could NEVER match — the KR
  // audience's four keyword-driven traits stayed pinned to the 0.4 base.
  test("Korean distress text lifts neuroticism above the base", () => {
    expect(__test_scoreFromAnswers([row("나는 요즘 너무 불안하고 걱정이 많다")]).neuroticism).toBeGreaterThan(0.4);
  });

  test("Korean routine text lifts conscientiousness above the base", () => {
    expect(__test_scoreFromAnswers([row("매일 꾸준히 루틴을 지키려 한다")]).conscientiousness).toBeGreaterThan(0.4);
  });

  test("English distress still matches via the ascii path", () => {
    expect(__test_scoreFromAnswers([row("I feel so anxious and stressed lately")]).neuroticism).toBeGreaterThan(0.4);
  });
});

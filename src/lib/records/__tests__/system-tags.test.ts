// records.system_tags (0218) - the helpers every reader and writer goes through.
//
// The two properties that matter: (1) with the column, only the app's column
// says "the app wrote this", so a user tag with the same word is never read as
// the marker; (2) without the column (0218 not applied / rolled back), every
// reader behaves exactly as before 0218. The column fallback is asked once per
// session and never swallows a real error.
import {
  firstLightSystemTags,
  hasSystemTag,
  isMissingSystemTagsColumnError,
  legacyTagLayout,
  normalizeSystemTags,
  recallInterviewSystemTags,
  resetSystemTagsColumnStateForTests,
  systemTagsColumnState,
  systemTagsOf,
  withSystemTagsColumn,
} from "../system-tags";

beforeEach(() => resetSystemTagsColumnStateForTests());

describe("writer shapes", () => {
  it("TTFV and the recall interview attach exactly what they wrote before 0218", () => {
    expect(firstLightSystemTags("affirm")).toEqual(["first_light", "first_light:affirm"]);
    expect(firstLightSystemTags("soft")).toEqual(["first_light", "first_light:soft"]);
    expect(recallInterviewSystemTags("ko")).toEqual(["interview", "recall", "screener", "entry-ui:ko"]);
    expect(recallInterviewSystemTags("en")).toEqual(["interview", "recall", "screener", "entry-ui:en"]);
  });
});

describe("reading a row", () => {
  it("with the column, only system_tags counts: a user tag named interview is not the marker", () => {
    const userTagged = { tags: ["domain:career", "interview"], system_tags: [] };
    expect(hasSystemTag(userTagged, "interview")).toBe(false);
    expect(systemTagsOf(userTagged)).toEqual([]);

    const interview = { tags: ["domain:growth"], system_tags: ["interview", "recall", "screener", "entry-ui:ko"] };
    expect(hasSystemTag(interview, "interview")).toBe(true);
  });

  it("without the column (no system_tags key), the pre-0218 reading applies", () => {
    expect(hasSystemTag({ tags: ["domain:growth", "interview", "recall"] }, "interview")).toBe(true);
    expect(hasSystemTag({ tags: ["domain:growth"] }, "interview")).toBe(false);
    expect(systemTagsOf({ tags: null })).toEqual([]);
  });

  it("ignores non-string garbage in either column", () => {
    const row = { tags: null, system_tags: ["first_light", 3, null] as unknown as string[] };
    expect(systemTagsOf(row)).toEqual(["first_light"]);
  });
});

describe("normalizeSystemTags", () => {
  it("keeps order, drops blanks and duplicates, and never takes a domain: tag", () => {
    expect(normalizeSystemTags(["interview", " ", "interview", "Domain:career", "recall"])).toEqual([
      "interview",
      "recall",
    ]);
    expect(normalizeSystemTags(undefined)).toEqual([]);
  });
});

describe("legacyTagLayout (insert into a database without the column)", () => {
  it("puts the markers right after the domain tag, as the pre-0218 writers did", () => {
    expect(legacyTagLayout(["domain:growth", "mine"], ["interview", "recall"])).toEqual([
      "domain:growth",
      "interview",
      "recall",
      "mine",
    ]);
  });

  it("puts them first when there is no leading domain tag, and is a copy when there are none", () => {
    expect(legacyTagLayout(["mine"], ["first_light"])).toEqual(["first_light", "mine"]);
    const tags = ["domain:collect"];
    const out = legacyTagLayout(tags, []);
    expect(out).toEqual(tags);
    expect(out).not.toBe(tags);
  });
});

describe("isMissingSystemTagsColumnError", () => {
  it("is true only for an undefined-column answer that names system_tags", () => {
    expect(isMissingSystemTagsColumnError({ code: "42703", message: "column records.system_tags does not exist" })).toBe(true);
    expect(
      isMissingSystemTagsColumnError({
        code: "PGRST204",
        message: "Could not find the 'system_tags' column of 'records' in the schema cache",
      }),
    ).toBe(true);
  });

  it("is false for every other failure, so a real error is never retried away", () => {
    expect(isMissingSystemTagsColumnError({ code: "42703", message: "column records.nope does not exist" })).toBe(false);
    expect(isMissingSystemTagsColumnError({ code: "42501", message: "permission denied for system_tags" })).toBe(false);
    expect(isMissingSystemTagsColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingSystemTagsColumnError(null)).toBe(false);
    expect(isMissingSystemTagsColumnError("42703 system_tags")).toBe(false);
  });
});

describe("withSystemTagsColumn", () => {
  const missing = { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } };

  it("asks once with the column when the database has it", async () => {
    const run = jest.fn(async (present: boolean) => ({ data: present ? "with" : "without", error: null }));
    await expect(withSystemTagsColumn(run)).resolves.toEqual({ data: "with", error: null });
    expect(run.mock.calls).toEqual([[true]]);
    expect(systemTagsColumnState()).toBe("present");
  });

  it("asks again without the column once, then stops asking for it this session", async () => {
    const run = jest.fn(async (present: boolean) => (present ? missing : { data: "legacy", error: null }));
    await expect(withSystemTagsColumn(run)).resolves.toEqual({ data: "legacy", error: null });
    expect(run.mock.calls).toEqual([[true], [false]]);
    expect(systemTagsColumnState()).toBe("absent");

    run.mockClear();
    await withSystemTagsColumn(run);
    expect(run.mock.calls).toEqual([[false]]);
  });

  it("returns any other error as it came, without a second query", async () => {
    const denied = { data: null, error: { code: "42501", message: "permission denied" } };
    const run = jest.fn(async () => denied);
    await expect(withSystemTagsColumn(run)).resolves.toBe(denied);
    expect(run).toHaveBeenCalledTimes(1);
    expect(systemTagsColumnState()).toBe("unknown");
  });

  it("lets a thrown error (a timeout) through untouched", async () => {
    const boom = new Error("record insert timed out");
    const run = jest.fn(async () => {
      throw boom;
    });
    await expect(withSystemTagsColumn(run)).rejects.toBe(boom);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

// Gate CDA-06 (#2094 r1 · r2, Q-261004-39 Q5, 2026-10-07). The "organized" share
// behind star brightness strips the tags that say HOW a record was captured. It
// used to strip `interview` from every row, so a tag the user typed themselves
// (`interview` on a job-interview note) stopped counting. Since 0218 the recall
// interview's marker lives in records.system_tags; on a row read with that column
// an `interview` in `tags` is the user's own. Only a row read from a database
// without the column (0218 not applied / rolled back) still carries the app's
// marker in `tags`, and only there is it stripped, exactly as before 0218.

const mockSelects: string[] = [];
let mockNoSystemTagsColumn = false;

jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        if (table === "records") mockSelects.push(columns);
        const result =
          table === "records" && mockNoSystemTagsColumn && columns.includes("system_tags")
            ? { data: null, error: { code: "42703", message: "column records.system_tags does not exist" } }
            : { data: [], error: null };
        const promise = Promise.resolve(result);
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          then: (...args: unknown[]) => promise.then(...(args as Parameters<typeof promise.then>)),
        };
        return chain;
      },
    }),
  }),
}));

import { invalidateDomainLevels, loadDomainLevels, userOrganizedTags } from "../load-domain-levels";

beforeEach(() => {
  mockSelects.length = 0;
  mockNoSystemTagsColumn = false;
  invalidateDomainLevels();
});

describe("userOrganizedTags", () => {
  it("with the column, a user's own interview tag counts; capture markers and domain: do not", () => {
    expect(userOrganizedTags({ tags: ["domain:career", "interview", "mine"], system_tags: [] })).toEqual([
      "interview",
      "mine",
    ]);
    expect(userOrganizedTags({ tags: ["domain:collect", "voice", "Todo"], system_tags: [] })).toEqual([]);
  });

  it("an interview the app wrote since 0218 has no tag left to count", () => {
    expect(
      userOrganizedTags({ tags: ["domain:growth"], system_tags: ["interview", "recall", "screener", "entry-ui:ko"] }),
    ).toEqual([]);
  });

  it("without the column (no system_tags key), interview is still the app's marker and is stripped", () => {
    expect(userOrganizedTags({ tags: ["domain:career", "interview", "mine"] })).toEqual(["mine"]);
    expect(userOrganizedTags({ tags: null })).toEqual([]);
  });
});

describe("the records scan", () => {
  it("asks for system_tags, and once more without it on a database that has no such column", async () => {
    await loadDomainLevels("u1");
    expect(mockSelects).toEqual(["id, created_at, tags, system_tags"]);

    invalidateDomainLevels();
    mockSelects.length = 0;
    mockNoSystemTagsColumn = true;
    await loadDomainLevels("u1");
    expect(mockSelects).toEqual(["id, created_at, tags, system_tags", "id, created_at, tags"]);
  });
});

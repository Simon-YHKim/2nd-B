import { rankRisingInterests, type RecordTagRow } from "../rising";

const NOW = new Date("2026-06-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("rankRisingInterests", () => {
  test("surfaces tags that rose from prior to recent window", () => {
    const rows: RecordTagRow[] = [
      { tags: ["ai"], created_at: daysAgo(1) },
      { tags: ["ai"], created_at: daysAgo(2) },
      { tags: ["ai"], created_at: daysAgo(3) },
      { tags: ["ai"], created_at: daysAgo(10) }, // prior window: 1
    ];
    const out = rankRisingInterests(rows, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tag: "ai", recent: 3, prior: 1, delta: 2 });
  });

  test("excludes flat or falling tags", () => {
    const rows: RecordTagRow[] = [
      { tags: ["climbing"], created_at: daysAgo(1) }, // recent 1
      { tags: ["climbing"], created_at: daysAgo(9) }, // prior 1 -> delta 0, excluded
      { tags: ["old"], created_at: daysAgo(8) }, // prior only -> excluded
    ];
    expect(rankRisingInterests(rows, NOW)).toEqual([]);
  });

  test("case-insensitive match, first-seen display casing, sorted by delta", () => {
    const rows: RecordTagRow[] = [
      { tags: ["Reading", "reading"], created_at: daysAgo(1) },
      { tags: ["reading"], created_at: daysAgo(2) }, // reading recent=3, prior=0
      { tags: ["walk"], created_at: daysAgo(1) }, // walk recent=1
    ];
    const out = rankRisingInterests(rows, NOW);
    expect(out[0]).toMatchObject({ tag: "Reading", delta: 3 });
    expect(out.map((r) => r.tag)).toEqual(["Reading", "walk"]);
  });

  test("ignores blank tags and bad dates; caps at 6", () => {
    const rows: RecordTagRow[] = [];
    for (let i = 0; i < 9; i++) rows.push({ tags: [`t${i}`, "  ", ""], created_at: daysAgo(1) });
    rows.push({ tags: ["x"], created_at: "not-a-date" });
    const out = rankRisingInterests(rows, NOW);
    expect(out.length).toBe(6);
    expect(out.every((r) => r.tag.trim().length > 0)).toBe(true);
  });

  test("app-written scaffolding tags never surface as interests (QA 261004 D-07)", () => {
    // A brand-new user who answered the first-run note has exactly this record.
    // Before the fix /discover listed "first_light" and "first_light:affirm".
    const ttfvOnly: RecordTagRow[] = [
      { tags: ["first_light", "first_light:affirm", "domain:growth"], created_at: daysAgo(1) },
      { tags: ["interview", "recall", "screener", "entry-ui:en"], created_at: daysAgo(2) },
      { tags: ["FIRST_LIGHT:soft", "Voice", "todo"], created_at: daysAgo(3) },
    ];
    expect(rankRisingInterests(ttfvOnly, NOW)).toEqual([]);

    const mixed: RecordTagRow[] = [
      { tags: ["first_light", "interview", "reading"], created_at: daysAgo(1) },
    ];
    expect(rankRisingInterests(mixed, NOW).map((r) => r.tag)).toEqual(["reading"]);
  });
});

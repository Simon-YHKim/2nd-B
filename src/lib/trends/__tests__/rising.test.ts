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
    // Each row is what its writer stores: createRecord puts domain: first.
    const appOnly: RecordTagRow[] = [
      { tags: ["domain:growth", "first_light", "first_light:affirm"], created_at: daysAgo(1), kind: "note" },
      { tags: ["domain:career", "interview", "recall", "screener", "entry-ui:en"], created_at: daysAgo(2), kind: "audit_response" },
      { tags: ["domain:rest", "Voice"], created_at: daysAgo(3), kind: "note" },
      { tags: ["domain:collect", "todo"], created_at: daysAgo(4), kind: "note" },
    ];
    expect(rankRisingInterests(appOnly, NOW)).toEqual([]);

    const mixed: RecordTagRow[] = [
      { tags: ["domain:career", "interview", "recall", "screener", "entry-ui:ko", "reading"], created_at: daysAgo(1), kind: "audit_response" },
    ];
    expect(rankRisingInterests(mixed, NOW).map((r) => r.tag)).toEqual(["reading"]);
  });

  test("a topic the user typed survives even when the app writes the same word (gate SG-01 / BL-01)", () => {
    // A journal about a job interview, a to-do hashtag, a "recall" practice tag:
    // the user chose these, so they are interests, whatever their spelling.
    const userTyped: RecordTagRow[] = [
      { tags: ["domain:career", "Interview"], created_at: daysAgo(1), kind: "journal" },
      { tags: ["domain:career", "interview", "todo"], created_at: daysAgo(2), kind: "journal" },
      // A voice note the user hashtagged "todo": the mode marker goes, the hashtag stays.
      { tags: ["domain:rest", "voice", "todo"], created_at: daysAgo(3), kind: "note" },
      // first_light without its first_light:<choice> pair is not the TTFV note.
      { tags: ["domain:growth", "first_light", "recall"], created_at: daysAgo(4), kind: "note" },
      // Kind unknown: no proof the app wrote it, so it is kept.
      { tags: ["screener"], created_at: daysAgo(5) },
    ];
    expect(rankRisingInterests(userTyped, NOW).map((r) => `${r.tag}:${r.recent}`).sort()).toEqual(
      ["Interview:2", "first_light:1", "recall:1", "screener:1", "todo:2"],
    );
  });
});

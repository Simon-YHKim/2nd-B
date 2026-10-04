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
      { tags: ["domain:career", "interview", "recall", "screener"], created_at: daysAgo(3), kind: "audit_response" },
    ];
    expect(rankRisingInterests(appOnly, NOW)).toEqual([]);

    const mixed: RecordTagRow[] = [
      { tags: ["domain:career", "interview", "recall", "screener", "entry-ui:ko", "reading"], created_at: daysAgo(1), kind: "audit_response" },
      // Call reflection's voice is the app's (gate SG-03).
      { tags: ["domain:relation", "call_reflection", "voice"], created_at: daysAgo(2), kind: "note" },
    ];
    expect(rankRisingInterests(mixed, NOW).map((r) => r.tag).sort()).toEqual(["call_reflection", "reading"]);
  });

  test("a topic the user typed survives even when the app writes the same word (gate SG-01 / BL-01)", () => {
    const tagsOf = (rows: RecordTagRow[]) =>
      rankRisingInterests(rows, NOW).map((r) => `${r.tag}:${r.recent}`).sort();
    // A journal about a job interview, a to-do hashtag: the user chose these.
    // A note's first tag may be the user's too (/dashboard's capture from
    // /capture?tag=, or record detail on an untagged note), so it is kept.
    expect(
      tagsOf([
        { tags: ["domain:career", "Interview"], created_at: daysAgo(1), kind: "journal" },
        { tags: ["domain:career", "interview", "todo"], created_at: daysAgo(2), kind: "journal" },
        { tags: ["domain:recreation", "voice", "todo"], created_at: daysAgo(3), kind: "note" },
      ]),
    ).toEqual(["Interview:2", "todo:2", "voice:1"]);
    // A first_light pair the user typed beside capture's mode is not the TTFV note.
    expect(
      tagsOf([{ tags: ["domain:growth", "voice", "first_light", "first_light:soft"], created_at: daysAgo(1), kind: "note" }]),
    ).toEqual(["first_light:1", "first_light:soft:1", "voice:1"]);
    // An /audit answer the user tagged in record detail is not the recall
    // interview; with kind unknown nothing is proven, so it is kept.
    expect(
      tagsOf([
        { tags: ["domain:growth", "life_audit", "values", "recall"], created_at: daysAgo(1), kind: "audit_response" },
        { tags: ["screener"], created_at: daysAgo(2) },
      ]),
    ).toEqual(["life_audit:1", "recall:1", "screener:1", "values:1"]);
  });
});

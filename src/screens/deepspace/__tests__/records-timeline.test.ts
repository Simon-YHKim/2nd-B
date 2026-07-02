// Unit tests for the deep-space /records timeline view-model.

import { buildRecordsTimeline, relatedByTag, type TimelineRecord } from "../records-timeline";

// A fixed "now": 2026-06-19 12:00 KST == 03:00 UTC.
const NOW = new Date("2026-06-19T03:00:00Z");

function rec(p: Partial<TimelineRecord> & { id: string; created_at: string }): TimelineRecord {
  return { kind: "journal", ...p };
}

describe("buildRecordsTimeline", () => {
  test("buckets records into 오늘 / 어제 / dated groups by KST day", () => {
    const groups = buildRecordsTimeline(
      [
        rec({ id: "t1", created_at: "2026-06-19T01:00:00Z", summary: "오늘 아침 메모" }), // today (10:00 KST)
        rec({ id: "y1", created_at: "2026-06-18T05:00:00Z", summary: "어제 낮" }), // yesterday
        rec({ id: "o1", created_at: "2026-06-10T05:00:00Z", summary: "지난 기록" }), // older
      ],
      { now: NOW },
    );
    expect(groups.map((g) => g.label)).toEqual(["오늘", "어제", "6월 10일"]);
    expect(groups[0].items[0].title).toBe("오늘 아침 메모");
    expect(groups[0].items[0].dim).toBe(false);
    expect(groups[1].items[0].dim).toBe(true);
  });

  test("today rows get a relative time label; older rows do not", () => {
    const groups = buildRecordsTimeline(
      [rec({ id: "t1", created_at: "2026-06-19T01:00:00Z", summary: "x" })],
      { now: NOW },
    );
    expect(groups[0].items[0].timeLabel).toBe("2시간 전");
  });

  test("title falls back topic → body first line → '기록'", () => {
    const groups = buildRecordsTimeline(
      [
        rec({ id: "a", created_at: "2026-06-19T01:00:00Z", topic: "주제만" }),
        rec({ id: "b", created_at: "2026-06-19T01:00:00Z", body: "본문 첫 줄\n둘째 줄" }),
        rec({ id: "c", created_at: "2026-06-19T01:00:00Z" }),
      ],
      { now: NOW },
    );
    const titles = groups[0].items.map((i) => i.title);
    expect(titles).toEqual(["주제만", "본문 첫 줄", "기록"]);
  });

  test("surfaces the first tag as the chip", () => {
    const groups = buildRecordsTimeline(
      [rec({ id: "a", kind: "audit_response", created_at: "2026-06-19T01:00:00Z", summary: "s", tags: ["성장", "기록"] })],
      { now: NOW },
    );
    expect(groups[0].items[0].tag).toBe("#성장");
  });

  test("relatedByTag returns tag-sharing records, excluding the focal one", () => {
    const all: TimelineRecord[] = [
      rec({ id: "self", created_at: "2026-06-19T01:00:00Z", tags: ["감정"] }),
      rec({ id: "a", created_at: "2026-06-18T01:00:00Z", tags: ["감정", "기록"] }),
      rec({ id: "b", created_at: "2026-06-17T01:00:00Z", tags: ["성장"] }),
      rec({ id: "c", created_at: "2026-06-16T01:00:00Z", tags: ["감정"] }),
    ];
    const related = relatedByTag("self", ["감정"], all);
    expect(related.map((r) => r.id)).toEqual(["a", "c"]);
  });

  test("relatedByTag is empty when the focal record has no tags", () => {
    expect(relatedByTag("self", [], [rec({ id: "a", created_at: "x", tags: ["감정"] })])).toEqual([]);
  });

  test("ignores unparseable timestamps and respects maxGroups", () => {
    const groups = buildRecordsTimeline(
      [
        rec({ id: "bad", created_at: "not-a-date", summary: "x" }),
        rec({ id: "d1", created_at: "2026-06-19T01:00:00Z", summary: "a" }),
        rec({ id: "d2", created_at: "2026-06-17T01:00:00Z", summary: "b" }),
        rec({ id: "d3", created_at: "2026-06-15T01:00:00Z", summary: "c" }),
      ],
      { now: NOW, maxGroups: 2 },
    );
    expect(groups).toHaveLength(2);
  });
});

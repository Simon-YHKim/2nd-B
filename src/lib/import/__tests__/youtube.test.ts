// Fixture-based contract for the YouTube Takeout watch-history parser (P1).
// Derived-signals law: ads excluded everywhere, channel/month aggregates only.

import { parseYouTubeWatchHistory, summarizeWatchHistory } from "../youtube";

const FIXTURE = [
  {
    header: "YouTube",
    title: "Watched 별자리 만들기 브이로그",
    titleUrl: "https://www.youtube.com/watch?v=aaa111",
    subtitles: [{ name: "우주채널", url: "https://www.youtube.com/channel/UC1" }],
    time: "2026-06-05T13:00:00.000Z",
  },
  {
    header: "YouTube",
    title: "Watched TypeScript deep dive",
    titleUrl: "https://www.youtube.com/watch?v=bbb222",
    subtitles: [{ name: "DevCasts", url: "https://www.youtube.com/channel/UC2" }],
    time: "2026-06-20T22:10:00.000Z",
  },
  {
    header: "YouTube",
    title: "Watched TS generics in 10 minutes",
    titleUrl: "https://www.youtube.com/watch?v=ccc333",
    subtitles: [{ name: "DevCasts", url: "https://www.youtube.com/channel/UC2" }],
    time: "2026-07-01T09:00:00.000Z",
  },
  {
    // Ad playback riding the same file — must be excluded from every signal.
    header: "YouTube",
    title: "Watched Some product ad",
    time: "2026-07-01T09:05:00.000Z",
    details: [{ name: "From Google Ads" }],
  },
  {
    // Removed/private video: no subtitles, still a watch event.
    header: "YouTube",
    title: "Watched https://www.youtube.com/watch?v=gone",
    time: "2026-07-02T11:00:00.000Z",
  },
];

describe("parseYouTubeWatchHistory", () => {
  test("parses records, strips the EN action prefix, marks ads", () => {
    const events = parseYouTubeWatchHistory(FIXTURE);
    expect(events).toHaveLength(5);
    expect(events[0]).toMatchObject({ title: "별자리 만들기 브이로그", channel: "우주채널", ad: false });
    expect(events[3].ad).toBe(true);
    expect(events[4].channel).toBeNull();
  });

  test("strips the KO action suffix variant", () => {
    const events = parseYouTubeWatchHistory([
      { header: "YouTube", title: "우주 다큐를 시청했습니다.", time: "2026-07-01T00:00:00Z" },
    ]);
    expect(events[0].title).toBe("우주 다큐");
  });

  test("non-YouTube headers and malformed records are dropped", () => {
    const events = parseYouTubeWatchHistory([
      { header: "Chrome", title: "Visited example.com", time: "2026-07-01T00:00:00Z" },
      null,
      42,
      "x",
      {},
    ]);
    expect(events).toEqual([]);
  });

  test("non-array payloads yield nothing", () => {
    expect(parseYouTubeWatchHistory(null)).toEqual([]);
    expect(parseYouTubeWatchHistory({ locations: [] })).toEqual([]);
    expect(parseYouTubeWatchHistory("[]")).toEqual([]);
  });
});

describe("summarizeWatchHistory", () => {
  test("channel counts exclude ads; months are newest first", () => {
    const s = summarizeWatchHistory(parseYouTubeWatchHistory(FIXTURE));
    expect(s.total).toBe(4);
    expect(s.ads).toBe(1);
    expect(s.channels[0]).toEqual({ name: "DevCasts", count: 2 });
    expect(s.channels[1]).toEqual({ name: "우주채널", count: 1 });
    expect(s.months.map((m) => m.month)).toEqual(["2026-07", "2026-06"]);
    expect(s.months[0].count).toBe(2);
  });

  test("empty input summarizes to zeros", () => {
    expect(summarizeWatchHistory([])).toEqual({ total: 0, ads: 0, channels: [], months: [] });
  });
});

import {
  buildUserEventsUrl,
  parsePushActivity,
  sanitizeUsername,
  summarizeGithubActivity,
} from "../github";

describe("sanitizeUsername (GitHub login rules)", () => {
  test("accepts valid logins", () => {
    expect(sanitizeUsername("Simon-YHKim")).toBe("Simon-YHKim");
    expect(sanitizeUsername(" octocat ")).toBe("octocat");
    expect(sanitizeUsername("a1")).toBe("a1");
  });
  test("rejects invalid logins", () => {
    expect(sanitizeUsername("-bad")).toBe("");
    expect(sanitizeUsername("bad-")).toBe("");
    expect(sanitizeUsername("has space")).toBe("");
    expect(sanitizeUsername("a".repeat(40))).toBe("");
    expect(sanitizeUsername(null)).toBe("");
  });
});

describe("buildUserEventsUrl", () => {
  test("targets the public events endpoint", () => {
    expect(buildUserEventsUrl("octocat")).toBe(
      "https://api.github.com/users/octocat/events/public?per_page=100",
    );
  });
});

describe("parsePushActivity (PushEvents only, defensive)", () => {
  test("extracts repo + commit count + timestamp from PushEvents", () => {
    const json = [
      {
        type: "PushEvent",
        repo: { name: "Simon-YHKim/2nd-B" },
        created_at: "2026-06-20T08:00:00Z",
        payload: { commits: [{}, {}, {}] },
      },
      { type: "WatchEvent", repo: { name: "x/y" }, created_at: "2026-06-20T09:00:00Z" }, // ignored
      {
        type: "PushEvent",
        repo: { name: "Simon-YHKim/pixy" },
        created_at: "2026-06-19T10:00:00Z",
        payload: { size: 2 }, // falls back to size when commits[] absent
      },
    ];
    const out = parsePushActivity(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ repo: "Simon-YHKim/2nd-B", commitCount: 3, atIso: "2026-06-20T08:00:00Z" });
    expect(out[1].commitCount).toBe(2);
  });

  test("drops rows with no repo/timestamp and tolerates junk", () => {
    expect(parsePushActivity("nope")).toEqual([]);
    expect(parsePushActivity([{ type: "PushEvent" }])).toEqual([]);
    expect(parsePushActivity([{ type: "PushEvent", repo: { name: "x/y" }, created_at: "bad" }])).toEqual([]);
  });
});

describe("summarizeGithubActivity (window roll-up)", () => {
  const NOW = new Date("2026-06-20T12:00:00Z");
  test("sums commits, counts active days, dedupes repos within the window", () => {
    const pushes = [
      { repo: "a/b", commitCount: 3, atIso: "2026-06-20T08:00:00Z" },
      { repo: "a/b", commitCount: 1, atIso: "2026-06-19T08:00:00Z" },
      { repo: "c/d", commitCount: 2, atIso: "2026-06-19T20:00:00Z" }, // same day as above
      { repo: "a/b", commitCount: 5, atIso: "2026-01-01T00:00:00Z" }, // out of window
    ];
    const s = summarizeGithubActivity(pushes, NOW, 14);
    expect(s.commits).toBe(6); // 3 + 1 + 2
    expect(s.activeDays).toBe(2); // 06-20, 06-19
    expect(s.repos.sort()).toEqual(["a/b", "c/d"]);
  });
});

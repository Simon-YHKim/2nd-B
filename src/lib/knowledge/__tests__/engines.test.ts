// Unit tests for fuse / distill / memorize engines.

import { fuseFrameworks, distillContext, buildMemorizedPattern } from "../engines";
import type { KnowledgeRow } from "../types";

function row(framework: string, id = framework + Math.random().toString(36).slice(2, 4)): KnowledgeRow {
  return {
    id,
    title: `${framework}-paper-${id}`,
    authors: [],
    doi: null,
    url: null,
    framework,
    age_range: "lifespan",
    locale: "both",
    verified_at: null,
    summary_ko: null,
    summary_en: null,
    application_notes: null,
  };
}

describe("fuseFrameworks", () => {
  test("single framework passes through unchanged up to topN", () => {
    const rows = [row("sdt", "a"), row("sdt", "b"), row("sdt", "c")];
    expect(fuseFrameworks(rows, 2).map((r) => r.id)).toEqual(["a", "b"]);
  });

  test("two frameworks interleave round-robin", () => {
    const rows = [
      row("sdt", "s1"), row("sdt", "s2"), row("sdt", "s3"),
      row("attachment", "a1"), row("attachment", "a2"),
    ];
    const out = fuseFrameworks(rows, 4).map((r) => r.id);
    // Round-robin starting from sdt: s1, a1, s2, a2
    expect(out).toEqual(["s1", "a1", "s2", "a2"]);
  });

  test("three frameworks interleave", () => {
    const rows = [
      row("sdt", "s1"), row("sdt", "s2"),
      row("attachment", "a1"),
      row("cbt", "c1"), row("cbt", "c2"),
    ];
    const out = fuseFrameworks(rows, 4).map((r) => r.id);
    expect(out).toEqual(["s1", "a1", "c1", "s2"]);
  });

  test("empty input returns empty", () => {
    expect(fuseFrameworks([], 5)).toEqual([]);
  });
});

describe("distillContext", () => {
  test("short text returns unchanged", () => {
    expect(distillContext("Short.", 100)).toBe("Short.");
  });

  test("long text is cut to roughly the budget with ellipsis", () => {
    const sentences = ["First sentence here.", "Middle one.", "Another middle.", "A third middle.", "Last sentence."];
    const text = sentences.join(" ");
    const out = distillContext(text, 60);
    expect(out.length).toBeLessThanOrEqual(60); // honors the caller/DB budget (hard-capped)
    expect(out).toContain("First sentence here.");
    expect(out).toContain("Last sentence.");
  });

  test("empty-middle case: no hollow double ellipsis and stays within budget", () => {
    // 3+ sentences where first + last alone already blow the budget: the middle
    // packing keeps nothing, so the non-contiguous branch must collapse to a single
    // gap ("first … last", then truncate) rather than "first …  … last" overflowing.
    const first = "This is a fairly long opening sentence here.";
    const mid = "Mid.";
    const last = "And this is the long closing sentence too.";
    const out = distillContext([first, mid, last].join(" "), 50);
    expect(out).not.toContain(" …  … "); // never a hollow double ellipsis
    expect(out.length).toBeLessThanOrEqual(50); // honors the caller/DB budget
  });

  test("empty text returns empty", () => {
    expect(distillContext("", 100)).toBe("");
  });

  test("Korean sentence boundaries are respected", () => {
    const text = "오늘은 좋은 하루였어요. 친구를 만났어요. 카페에서 책을 읽었어요. 산책도 했어요. 잠이 잘 왔어요.";
    const out = distillContext(text, 50);
    // first + last present
    expect(out).toMatch(/오늘은 좋은 하루였어요/);
    expect(out).toMatch(/잠이 잘 왔어요/);
  });

  test("two-sentence text falls back to truncation", () => {
    const text = "Sentence one. Sentence two with lots of additional padding to exceed the budget.";
    const out = distillContext(text, 25);
    expect(out.length).toBeLessThanOrEqual(25);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildMemorizedPattern", () => {
  test("builds a row keyed by user with first batch as pattern_kind", () => {
    const out = buildMemorizedPattern({
      userId: "u1",
      matchedBatches: ["attachment", "interpersonal"],
      triggers: ["family"],
      text: "Observed: user keeps describing parental conflict as central source of distress.",
      zone: "yellow",
    });
    expect(out.user_id).toBe("u1");
    expect(out.pattern_kind).toBe("attachment");
    expect(out.evidence_batches).toEqual(["attachment", "interpersonal"]);
    expect(out.triggers).toEqual(["family"]);
    expect(out.recorded_zone).toBe("yellow");
    expect(out.summary.length).toBeGreaterThan(0);
  });

  test("summary is capped (long input is distilled)", () => {
    const longText = "Pattern one. ".repeat(60); // ~720 chars
    const out = buildMemorizedPattern({
      userId: "u1",
      matchedBatches: ["sdt"],
      triggers: [],
      text: longText,
      zone: "green",
    });
    expect(out.summary.length).toBeLessThanOrEqual(280);
  });

  test("falls back to 'general' when no batches matched", () => {
    const out = buildMemorizedPattern({
      userId: "u1",
      matchedBatches: [],
      triggers: [],
      text: "x",
      zone: "green",
    });
    expect(out.pattern_kind).toBe("general");
  });
});

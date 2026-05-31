import { monologuesFor, pickMonologue } from "../monologues";
import type { WorkerId } from "@/components/art/WorkerSprite";

const WORKERS: WorkerId[] = ["secondb", "archi", "gadi", "lulu", "momo", "vela", "lumi"];

describe("monologuesFor", () => {
  it("gives every worker non-empty self-talk in both locales", () => {
    for (const id of WORKERS) {
      expect(monologuesFor(id, "ko").length).toBeGreaterThan(0);
      expect(monologuesFor(id, "en").length).toBeGreaterThan(0);
    }
  });

  it("falls back to 세컨비 for an unknown id", () => {
    expect(monologuesFor("nope" as WorkerId, "ko")).toEqual(monologuesFor("secondb", "ko"));
  });
});

describe("pickMonologue", () => {
  it("maps r=0 to the first line and r→1 to the last", () => {
    const lines = monologuesFor("archi", "ko");
    expect(pickMonologue("archi", "ko", 0)).toBe(lines[0]);
    expect(pickMonologue("archi", "ko", 0.999)).toBe(lines[lines.length - 1]);
  });

  it("always returns one of the worker's own lines", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      const line = pickMonologue("gadi", "en", r);
      expect(monologuesFor("gadi", "en")).toContain(line);
    }
  });

  it("wraps out-of-range / non-finite r into range", () => {
    const lines = monologuesFor("lulu", "ko");
    expect(lines).toContain(pickMonologue("lulu", "ko", 1.5));
    expect(lines).toContain(pickMonologue("lulu", "ko", -0.25));
    expect(pickMonologue("lulu", "ko", NaN)).toBe(lines[0]);
  });
});

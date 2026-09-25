import { STAR_ENTRY_TRACKS, starEntryStatus } from "../star-entry-tracks";
import type { LadderLevel } from "../brightness";
import type { SevenStarId } from "../seven-stars";

const levels = (lit: SevenStarId[]): Partial<Record<SevenStarId, LadderLevel>> =>
  Object.fromEntries(lit.map((id) => [id, 2])) as Partial<Record<SevenStarId, LadderLevel>>;

describe("the two seven-star entry tracks", () => {
  it("keeps the same profile root and no cross-track shortcut", () => {
    expect(STAR_ENTRY_TRACKS).toEqual([
      ["profile", "infancy", "school", "twenties", "later"],
      ["profile", "work", "now"],
    ]);
    expect(starEntryStatus("profile", {}, 35)).toEqual({ kind: "available" });
    expect(starEntryStatus("infancy", levels(["work"]), 35)).toEqual({
      kind: "previous", prerequisite: "profile",
    });
    expect(starEntryStatus("work", levels(["infancy"]), 35)).toEqual({
      kind: "previous", prerequisite: "profile",
    });
  });

  it("opens only the immediate next star after the first saved input", () => {
    expect(starEntryStatus("infancy", levels(["profile"]), 35)).toEqual({ kind: "available" });
    expect(starEntryStatus("school", levels(["profile"]), 35)).toEqual({
      kind: "previous", prerequisite: "infancy",
    });
    expect(starEntryStatus("school", levels(["profile", "infancy"]), 35)).toEqual({ kind: "available" });
    expect(starEntryStatus("now", levels(["profile"]), 35)).toEqual({
      kind: "previous", prerequisite: "work",
    });
    expect(starEntryStatus("now", levels(["profile", "work"]), 35)).toEqual({ kind: "available" });
  });

  it("keeps not-yet-lived periods locked even if prior input exists", () => {
    expect(starEntryStatus("later", levels(["twenties"]), 25)).toEqual({ kind: "unlived" });
    expect(starEntryStatus("twenties", levels(["school"]), 19)).toEqual({ kind: "unlived" });
    expect(starEntryStatus("later", levels(["twenties"]), null)).toEqual({ kind: "available" });
  });
});

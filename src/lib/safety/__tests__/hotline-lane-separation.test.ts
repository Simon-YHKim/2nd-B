// Q-261015-82 adds explicit emergency lanes. Self-harm alone still selects
// the existing support lane; a bare noun never selects police or ambulance.
import { crisisHotlines, classifyInput } from "../classifier";
import { HOTLINES, type HotlineId } from "../lexicon";

const OUTSIDE_SUPPORT_LANE: HotlineId[] = ["KR_117", "KR_1366", "KR_119", "KR_112"];

describe("hotline lane separation", () => {
  it("keeps emergency and directory numbers out of the support hotline list", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const minor of [true, false]) {
        const ids = crisisHotlines(locale, minor).map((h) => h.id);
        for (const banned of OUTSIDE_SUPPORT_LANE) {
          expect(ids).not.toContain(banned);
        }
      }
    }
  });

  it("still routes the suicide lane to counselling, minors first", () => {
    expect(crisisHotlines("ko", true).map((h) => h.id)).toEqual(["KR_1388", "KR_109"]);
    expect(crisisHotlines("ko", false).map((h) => h.id)).toEqual(["KR_109"]);
  });

  it("never attaches an emergency number to self-harm alone", () => {
    // Self-harm without a separate emergency must stay on the support lane.
    const red = classifyInput("죽고 싶어", "ko", { minor: true });
    expect(red.zone).toBe("red");
    const routed = red.crisisRouting?.hotline;
    if (routed) expect(OUTSIDE_SUPPORT_LANE).not.toContain(routed);
  });

  it("defines the four directory numbers with the digits a person would dial", () => {
    // A wrong digit here is worse than a missing entry: the user believes they
    // reached help and did not.
    expect(HOTLINES.KR_117.number).toBe("117");
    expect(HOTLINES.KR_1366.number).toBe("1366");
    expect(HOTLINES.KR_119.number).toBe("119");
    expect(HOTLINES.KR_112.number).toBe("112");
  });

  it("uses no clinical vocabulary in the new labels", () => {
    // The forbidden-lexicon CI scan skips lexicon.ts (it is the source of the
    // banned list), so these labels are not covered by it. Check them here.
    const banned = ["정신건강", "심리치료", "심리상담", "치유", "우울증", "진단", "치료"];
    for (const id of OUTSIDE_SUPPORT_LANE) {
      for (const word of banned) {
        expect(HOTLINES[id].label).not.toContain(word);
      }
    }
  });
});

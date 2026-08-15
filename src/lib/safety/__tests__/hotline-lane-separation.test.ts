// L2 (Simon 2026-08-16): 117 / 1366 / 119 / 112 joined HOTLINES for the
// always-on help directory. They must NOT leak into crisis routing.
//
// The suicide/self-harm lane exists to hand someone a conversation. A police or
// ambulance number on that lane reframes them as a case, and the app has no
// signal that would justify it: the harm axis that could tell those situations
// apart was reviewed and rejected this round, because the Korean matcher has no
// word boundaries and the terms that would reach these numbers also reach
// "해풍 맞고 자란 시금치".
//
// So this is the guard on a decision, not on an implementation detail. Someone
// will eventually add a term and wire it "just for completeness", and this test
// is what should stop them.
import { crisisHotlines, classifyInput } from "../classifier";
import { HOTLINES, type HotlineId } from "../lexicon";

const DIRECTORY_ONLY: HotlineId[] = ["KR_117", "KR_1366", "KR_119", "KR_112"];

describe("hotline lane separation", () => {
  it("keeps the directory-only numbers out of every crisis routing result", () => {
    for (const locale of ["ko", "en"] as const) {
      for (const minor of [true, false]) {
        const ids = crisisHotlines(locale, minor).map((h) => h.id);
        for (const banned of DIRECTORY_ONLY) {
          expect(ids).not.toContain(banned);
        }
      }
    }
  });

  it("still routes the suicide lane to counselling, minors first", () => {
    expect(crisisHotlines("ko", true).map((h) => h.id)).toEqual(["KR_1388", "KR_109"]);
    expect(crisisHotlines("ko", false).map((h) => h.id)).toEqual(["KR_109"]);
  });

  it("never attaches a directory-only number to a classified crisis result", () => {
    // A red result carries crisisRouting for the modal. Whatever ends up there
    // must come from the counselling lane.
    const red = classifyInput("죽고 싶어", "ko", { minor: true });
    expect(red.zone).toBe("red");
    const routed = red.crisisRouting?.hotline;
    if (routed) expect(DIRECTORY_ONLY).not.toContain(routed);
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
    for (const id of DIRECTORY_ONLY) {
      for (const word of banned) {
        expect(HOTLINES[id].label).not.toContain(word);
      }
    }
  });
});

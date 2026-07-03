// Canon guard for the restored reference ImagineScreen (sb-more IMAGINE_SEEDS):
// three divergent seeds, three next-steps each, KO copy pinned to the design
// handoff verbatim, EN mirror complete.
import { IMAGINE_SEEDS } from "../imagine-seeds";

describe("IMAGINE_SEEDS canon", () => {
  test("three seeds with the reference angles, in order", () => {
    expect(IMAGINE_SEEDS.map((s) => s.ko.angle)).toEqual(["확장", "반전", "연결"]);
  });

  test("each seed carries exactly three next-steps in both locales", () => {
    for (const s of IMAGINE_SEEDS) {
      expect(s.ko.steps).toHaveLength(3);
      expect(s.en.steps).toHaveLength(3);
    }
  });

  test("KO copy matches the design handoff verbatim", () => {
    expect(IMAGINE_SEEDS[0].ko.title).toBe("1년 안식년을 떠난다면");
    expect(IMAGINE_SEEDS[1].ko.body).toBe("계획 대신 즉흥, 혼자 대신 함께. 반대편에서 끌리는 한 가지는?");
    expect(IMAGINE_SEEDS[2].ko.steps[2]).toBe("성장 별에 실험으로 기록");
  });

  test("no em-dash sneaks into seed copy (CI locale guard parity)", () => {
    const all = IMAGINE_SEEDS.flatMap((s) => [
      s.ko.title,
      s.ko.body,
      ...s.ko.steps,
      s.en.title,
      s.en.body,
      ...s.en.steps,
    ]).join("");
    expect(all).not.toContain("—");
  });
});

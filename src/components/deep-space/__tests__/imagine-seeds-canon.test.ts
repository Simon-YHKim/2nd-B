// Canon guard for the restored reference ImagineScreen (sb-more IMAGINE_SEEDS):
// three divergent seeds, three next-steps each, KO copy now SOURCED from the
// design canon pack — this suite pins module <-> pack equality (drift guard)
// plus the structural invariants and complete EN mirror.
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
import { canonMore } from "@/lib/canon";
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

  test("KO copy and icons match the canon pack verbatim (module <-> pack drift guard)", () => {
    expect(canonMore.imagineSeeds).toHaveLength(3);
    expect(IMAGINE_SEEDS.map((s) => ({ icon: s.icon, ...s.ko }))).toEqual(
      canonMore.imagineSeeds.map((c) => ({
        icon: c.icon,
        angle: c.angle,
        title: c.title,
        body: c.body,
        steps: c.steps,
      })),
    );
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

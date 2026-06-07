// Regression guard for worldview v-final naming. Locks in mascot display names,
// the five Pattern Cores, and Simon's canonical character responsibilities.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PERSONAS, personaIds } from "@/lib/chat/personas";
import { CHARACTERS, CHARACTER_ORDER } from "@/lib/characters";
import { VILLAGE_LABEL, VILLAGE_IDS } from "@/lib/graph/relatedness";

const OLD_NAMES = ["Gadi", "Lulu", "Lumi", "Archi", "Vela", "가디", "루루", "루미", "아치", "벨라"];
const RETIRED_IMAGINE_PLACES = ["공상 작업실", "공상 작업장"];

const WORLDVIEW_CONCEPT_FILES = [
  "CONTEXT.md",
  "DESIGN.md",
  "docs/VISION.md",
  "src/lib/characters.ts",
  "src/lib/chat/personas.ts",
  "src/lib/graph/monologues.ts",
  "src/components/art/SoulcoreFinalArt.tsx",
  "src/components/graph/NavGraph.tsx",
  "src/components/premium/graph-bits.tsx",
  "src/lib/assets/soulcore-v3.ts",
  "src/lib/theme/tokens.ts",
  "src/lib/village-ui.ts",
] as const;

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("worldview v-final naming", () => {
  test("Vela is fully retired from personas + characters", () => {
    expect(personaIds()).not.toContain("vela");
    expect(CHARACTER_ORDER).not.toContain("vela");
    expect(Object.keys(CHARACTERS)).not.toContain("vela");
  });

  test("no persona display name is an old mascot name", () => {
    for (const id of personaIds()) {
      const p = PERSONAS[id];
      for (const old of OLD_NAMES) {
        expect(p.name.en).not.toBe(old);
        expect(p.name.ko).not.toBe(old);
      }
    }
  });

  test("renamed mascots use their worldview-v-final names", () => {
    expect(PERSONAS.gadi.name.en).toBe("Relia");
    expect(PERSONAS.lulu.name.en).toBe("Lumen");
    expect(PERSONAS.momo.name.en).toBe("Foreman Momo");
    expect(PERSONAS.lumi.name.en).toBe("Lumina");
    expect(PERSONAS.archi.name.en).toBe("Archon");
    expect(PERSONAS.secondb.name.en).toBe("SecondB");
  });

  test("persona roles and hints follow Simon's canonical responsibilities", () => {
    expect(PERSONAS.secondb.role.en).toBe("Soul Core navigator");
    expect(PERSONAS.secondb.systemHint.en).toContain("central AI for the Soul Core");
    expect(PERSONAS.secondb.systemHint.en).toContain("Analytic mode");
    expect(PERSONAS.secondb.systemHint.en).toContain("Divergent mode");

    expect(PERSONAS.archi.role.en).toBe("Career consultant");
    expect(PERSONAS.archi.systemHint.en).toContain("career consultant for work and growth");

    expect(PERSONAS.gadi.role.en).toBe("Warm relationship guide");
    expect(PERSONAS.gadi.systemHint.en).toContain("relationships");
    expect(PERSONAS.gadi.systemHint.en).toContain("inner-world patterns");

    expect(PERSONAS.lulu.role.en).toBe("Life-applied wisdom sage");
    expect(PERSONAS.lulu.systemHint.en).toContain("Not raw facts");
    expect(PERSONAS.lulu.systemHint.en).toContain("life-applied patterns");

    expect(PERSONAS.momo.role.en).toBe("Narrative Core crew foreman");
    expect(PERSONAS.momo.systemHint.en).toContain("you do NOT give advice");

    expect(PERSONAS.lumi.role.en).toBe("Trainer & curator");
    expect(PERSONAS.lumi.systemHint.en).toContain("healthy life balance");
  });

  test("concept docs and code use Lumina instead of Iris", () => {
    for (const file of WORLDVIEW_CONCEPT_FILES) {
      expect(readProjectFile(file)).not.toMatch(/\bIris\b/);
    }
    expect(readProjectFile("CONTEXT.md")).toContain("Lumina");
    expect(readProjectFile("DESIGN.md")).toContain("Muse/Lumina");
    expect(readProjectFile("docs/VISION.md")).toContain("Muse Core / Lumina");
  });

  test("village labels stay concrete (no imagine, no 공상 작업실)", () => {
    expect(VILLAGE_IDS).not.toContain("imagine");
    for (const id of VILLAGE_IDS) {
      for (const retired of RETIRED_IMAGINE_PLACES) {
        expect(VILLAGE_LABEL[id].ko).not.toContain(retired);
      }
    }
    expect(VILLAGE_LABEL.relation.ko).toBe("본드 코어");
    expect(VILLAGE_LABEL.relation.en).toBe("Bond Core");
  });
});

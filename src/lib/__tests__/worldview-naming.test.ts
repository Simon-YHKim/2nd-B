// Regression guard for worldview v-final naming. Locks in the mascot display
// renames + the 5 Pattern Cores, and prevents a slip back to the old names
// (Gadi/Lulu/Lumi/Archi/Vela) or 공상-as-place.

import { PERSONAS, personaIds } from "@/lib/chat/personas";
import { CHARACTERS, CHARACTER_ORDER } from "@/lib/characters";
import { VILLAGE_LABEL, VILLAGE_IDS } from "@/lib/graph/relatedness";

const OLD_NAMES = ["Gadi", "Lulu", "Lumi", "Archi", "Vela", "가디", "루루", "루미", "아치", "벨라"];

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
    expect(PERSONAS.lumi.name.en).toBe("Iris");
    expect(PERSONAS.archi.name.en).toBe("Archon");
    expect(PERSONAS.secondb.name.en).toBe("SecondB");
  });

  test("village labels are the 5 Pattern Cores (no imagine, no 공상 작업실)", () => {
    expect(VILLAGE_IDS).not.toContain("imagine");
    for (const id of VILLAGE_IDS) {
      expect(VILLAGE_LABEL[id].ko).not.toContain("공상 작업실");
    }
    expect(VILLAGE_LABEL.relation.ko).toBe("관계와 사랑");
    expect(VILLAGE_LABEL.relation.en).toBe("Bond Core");
  });
});

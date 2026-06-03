import { CHARACTERS, CHARACTER_ORDER, characterForRoute, type CharacterId } from "../characters";
import { cosmic, characters as characterColors } from "../theme/tokens";

describe("Cosmic Pixel palette", () => {
  test("contains the 6 signal accents from the handoff", () => {
    expect(cosmic.signalBlue).toBe("#4CC9F0");
    expect(cosmic.signalMint).toBe("#72F2C7");
    expect(cosmic.soulViolet).toBe("#A78BFA");
    expect(cosmic.pixelLamp).toBe("#FFD166");
    expect(cosmic.dreamPink).toBe("#FF9FD6");
    expect(cosmic.guardRose).toBe("#FF7A90");
  });

  test("deep space backgrounds match the handoff spec", () => {
    expect(cosmic.space950).toBe("#070A18");
    expect(cosmic.space900).toBe("#0D1530");
    expect(cosmic.space800).toBe("#16213E");
  });
});

describe("characters palette mapping", () => {
  test("each of the 6 residents has the handoff-mandated accent", () => {
    expect(characterColors.secondb).toBe("#A78BFA"); // Soul Violet
    expect(characterColors.momo).toBe("#E8ECF8"); // Narrative monochrome
    expect(characterColors.lulu).toBe("#72F2C7"); // Lumen mint
    expect(characterColors.archi).toBe("#4CC9F0"); // Archon blue
    expect(characterColors.vela).toBe("#FF9FD6"); // Dream Pink
    expect(characterColors.gadi).toBe("#FFD166"); // Relia lamp
  });
});

describe("CHARACTERS roster", () => {
  test("has all 6 residents from the handoff", () => {
    expect(Object.keys(CHARACTERS).sort()).toEqual(
      ["archi", "gadi", "lulu", "momo", "secondb", "vela"].sort(),
    );
    expect(CHARACTER_ORDER).toHaveLength(6);
  });

  test("each character has KO name + voice line", () => {
    for (const id of CHARACTER_ORDER) {
      const c = CHARACTERS[id as CharacterId];
      expect(c.name.ko.length).toBeGreaterThan(0);
      expect(c.line.ko.length).toBeGreaterThan(3);
    }
  });

  test("character voice lines stay clear of forbidden clinical vocab", () => {
    // The handoff §6 explicitly forbids these in any user-facing surface,
    // including character voice lines. Defense in depth on top of the
    // existing src/lib/safety/lexicon.ts CI scan.
    const forbidden = ["진단", "치료", "치유", "정신건강", "심리상담", "멘탈"];
    for (const id of CHARACTER_ORDER) {
      const c = CHARACTERS[id as CharacterId];
      for (const word of forbidden) {
        expect(c.line.ko).not.toContain(word);
        expect(c.role.ko).not.toContain(word);
      }
    }
  });
});

describe("characterForRoute", () => {
  test("/jarvis → SecondB", () => {
    expect(characterForRoute("/jarvis")?.id).toBe("secondb");
  });

  test("/capture → Lumen", () => {
    expect(characterForRoute("/capture")?.id).toBe("lulu");
  });

  test("/imagine → SecondB", () => {
    expect(characterForRoute("/imagine")?.id).toBe("secondb");
  });

  test("/journal → Foreman Momo", () => {
    expect(characterForRoute("/journal")?.id).toBe("momo");
  });

  test("/persona → Archon", () => {
    expect(characterForRoute("/persona")?.id).toBe("archi");
  });

  test("unknown route → null", () => {
    expect(characterForRoute("/nonexistent")).toBeNull();
  });
});

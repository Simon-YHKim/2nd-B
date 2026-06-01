import { VILLAGE_IDS } from "@/lib/graph/relatedness";
import { CORE_VILLAGE_UI, VILLAGE_UI } from "@/lib/village-ui";

describe("village UI metadata", () => {
  test("covers every graph village with a matching island and owner", () => {
    expect(Object.keys(VILLAGE_UI).sort()).toEqual([...VILLAGE_IDS].sort());
    for (const id of VILLAGE_IDS) {
      expect(VILLAGE_UI[id].island).toBeTruthy();
      expect(VILLAGE_UI[id].worker).toBeTruthy();
      expect(VILLAGE_UI[id].accent).toBeTruthy();
      expect(VILLAGE_UI[id].speech.en).toBeTruthy();
      expect(VILLAGE_UI[id].speech.ko).toBeTruthy();
    }
  });

  test("keeps the graph center owned by SecondB", () => {
    expect(CORE_VILLAGE_UI.island).toBe("core");
    expect(CORE_VILLAGE_UI.worker).toBe("secondb");
  });
});

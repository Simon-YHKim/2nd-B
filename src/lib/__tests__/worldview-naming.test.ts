// Regression guard for worldview v-final naming. Locks in the five Pattern Cores
// naming in the concept docs, the village labels, and the north-star canon.
//
// ⚠ 2026-10-05 (Simon 결정 Q-261004-14 A · 15 A): 옛 캐릭터 명부(personas.ts ·
//   characters.ts)가 E:/Legacy/2ndB 로 가면서 여기 있던 명부 단언 넷(Vela 은퇴 ·
//   옛 이름 금지 · 새 이름 고정 · 캐릭터 역할/지시문)은 대상이 사라져 은퇴했다.
//   명부가 배송 코드로 돌아오지 않는 것은
//   src/lib/chat/__tests__/legacy-character-voice-retired.test.ts 가 지킨다.
//   아래(문서 · 마을 이름 · 북극성 캐논)는 명부와 무관한 배송 캐논이라 그대로 둔다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VILLAGE_LABEL, VILLAGE_IDS } from "@/lib/graph/relatedness";
import { containsForbiddenLexicon } from "@/lib/safety/classifier";

const RETIRED_IMAGINE_PLACES = ["공상 작업실", "공상 작업장"];

const WORLDVIEW_CONCEPT_FILES = [
  "CONTEXT.md",
  "DESIGN.md",
  "docs/VISION.md",
  // characters.ts · chat/personas.ts 는 2026-10-05 에 E:/Legacy 로 갔다(Q-261004-14 A).
  // lib/graph/monologues.ts · components/graph/NavGraph.tsx 는 2026-10-04 에
  // E:/Legacy 로 갔다(QA L2-01 · L4-06).
  "src/components/art/SoulcoreFinalArt.tsx",
  "src/components/premium/graph-bits.tsx",
  "src/lib/assets/soulcore-v3.ts",
  "src/lib/theme/tokens.ts",
  "src/lib/village-ui.ts",
] as const;

function readProjectFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("worldview v-final naming", () => {
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

// Synthesis memo (2026-06-17): north-star + 7-lens canon, Phase 0 pins.
// Locks the three glossary blocks added to CONTEXT.md - the 0th/1st/2nd/3rd brain
// bridge model, the single L1-L5 value ladder, and the north-star terminology map
// (북극성 = Soul Core, 페르소나 = 5 Pattern Cores, 별 = self-understanding dimension,
// 밝기 = L-level). Roles/Action/Knowledge stay OUT of the stars (goal-tree). L4 must
// read "교차검증 (cross-source agreement)" with no clinical lexicon anywhere.
describe("worldview canon: brain model + value ladder + north-star terminology", () => {
  test("core-brain visible locale labels use North Star naming", () => {
    const enCoreBrain = JSON.parse(readProjectFile("locales/en/core-brain.json"));
    const koCoreBrain = JSON.parse(readProjectFile("locales/ko/core-brain.json"));

    expect(enCoreBrain.soulCoreEyebrow).toBe("02. North Star");
    expect(enCoreBrain.myCenter).toBe("North Star");
    expect(koCoreBrain.soulCoreEyebrow).toBe("02. 북극성");
    expect(koCoreBrain.myCenter).toBe("북극성");
  });

  test("CONTEXT.md pins the 0th/1st/2nd/3rd brain bridge model", () => {
    const ctx = readProjectFile("CONTEXT.md");
    for (const layer of ["0th brain", "1st brain", "2nd brain", "3rd brain"]) {
      expect(ctx).toContain(layer);
    }
    // the app is the bridge, never a brain itself
    expect(ctx).toContain("bridge");
  });

  test("CONTEXT.md pins exactly five value-ladder levels L1..L5 (no L6)", () => {
    const ctx = readProjectFile("CONTEXT.md");
    for (const lvl of ["L1", "L2", "L3", "L4", "L5"]) {
      expect(ctx).toContain(lvl);
    }
    expect(ctx).not.toContain("L6");
    // L4 uses the non-clinical cross-source label
    expect(ctx).toContain("교차검증");
    expect(ctx).toContain("cross-source agreement");
  });

  test("CONTEXT.md maps north-star / persona / star / brightness to shipped canon", () => {
    const ctx = readProjectFile("CONTEXT.md");
    expect(ctx).toContain("북극성 (north star)");
    expect(ctx).toContain("페르소나 (persona)");
    expect(ctx).toContain("별 (star)");
    expect(ctx).toContain("밝기 (brightness)");
    expect(ctx).toContain("Soul Core");
    expect(ctx).toContain("Pattern Core");
    expect(ctx).toContain("L1 to L5");
    expect(ctx).toContain("self-understanding");
    // the seven lenses are present and numbered
    expect(ctx).toContain("별1");
    expect(ctx).toContain("별7");
  });

  test("roles / action / knowledge stay OUT of the stars (goal-tree, not a measurement axis)", () => {
    const ctx = readProjectFile("CONTEXT.md");
    expect(ctx).toMatch(/Roles \/ Action \/ Knowledge are NOT stars/i);
  });

  // 2026-10-05: 이 단언이 처음 지키던 personas.secondb.systemHint 는 옛 캐릭터 명부와 함께
  // 로케일에서 나갔다(Q-261004-14 A). 같은 이름 규칙이 배송 대화 묶음 안에 남은 자리
  // (rev2.lockNorthstar 의 Northstar 요금제 이름)로 그대로 걸린다.
  test("localized SecondB chat copy uses North Star naming, not legacy soul-core names", () => {
    const localeHints = [
      readProjectFile("locales/es/secondb.json"),
      readProjectFile("locales/pt/secondb.json"),
      readProjectFile("locales/id/secondb.json"),
    ];

    for (const text of localeHints) {
      expect(text).not.toContain("Núcleo del alma");
      expect(text).not.toContain("Núcleo da alma");
      expect(text).not.toContain("Inti Jiwa");
    }

    expect(localeHints[0]).toContain("Estrella Polar");
    expect(localeHints[1]).toContain("Estrela Polar");
    expect(localeHints[2]).toContain("Bintang Utara");
  });

  test("the canon glossary carries no forbidden clinical lexicon", () => {
    const ctx = readProjectFile("CONTEXT.md");
    expect(containsForbiddenLexicon(ctx, "en")).toHaveLength(0);
    expect(containsForbiddenLexicon(ctx, "ko")).toHaveLength(0);
  });
});

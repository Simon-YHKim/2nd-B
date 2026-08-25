// 딥스페이스 **표면** 토큰을 PIXEL-CLAY 캐논 램프에 묶는다.
//
// ── 왜 생겼나 (2026-08-30) ─────────────────────────────────────────────────
//
// `m3.ts` 는 midnight 로 옮겨졌는데 `tokens.ts` 는 rev2 값(시안 위 반투명 네이비)
// 그대로 남아 있었고, **아무 검사도 그걸 붙들지 않았다.** 그래서 158개 파일이
// 읽는 팔레트가 조용히 캐논 밖에 서 있었다.
//
// 얼마나 벌어졌는지는 픽셀로 쟀다: 레퍼런스 프레임의 최대 면적 색은 `#232e4a`
// (화면의 38~47%)인데, 같은 화면의 앱 스크린샷 상위 5색에는 그 색이 **한 번도**
// 나오지 않았다. 패널 층이 통째로 없었던 것이다.
//
// 이 검사는 값을 하나하나 박지 않는다 — 박으면 캐논이 움직일 때 같이 못 움직인다.
// 대신 **캐논 JSON 의 램프에 속하는가**만 본다. 그래서 캐논이 바뀌면 이 검사도
// 따라 움직이고, 코드만 혼자 벗어나면 깨진다.
//
// ⚠ 여기서 보는 것은 **표면(배경·패널·경계)뿐이다.** 강조색(시안 #46B6FF ↔ 캐논
// #5b8def)은 아직 옮기지 않았고 별건이다. 그 그룹을 옮길 때 이 파일에 추가할 것.
import fs from "node:fs";
import path from "node:path";

import { deepSpace, semantic } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

interface Kit {
  vars: Record<string, string>;
}

const kit = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "..", "design", "pixel_clay_260825", "data", "tokens.json"),
    "utf8",
  ),
) as Kit;

// midnight 램프 c00~c03. 캐논에서 읽는다 — 이 파일에 값을 베껴 두면 캐논이
// 움직였을 때 두 곳이 갈라진다.
const RAMP = ["--c00", "--c01", "--c02", "--c03"].map((k) => {
  const v = kit.vars[k];
  if (!v) throw new Error(`캐논 tokens.json 에 ${k} 가 없다`);
  return v.toLowerCase();
});

const inRamp = (hex: string) => RAMP.includes(hex.toLowerCase());

describe("딥스페이스 표면은 캐논 램프 안에 있다", () => {
  test("캐논 램프를 실제로 읽었다 (검사가 빈 배열 위에서 통과하지 않도록)", () => {
    expect(RAMP).toHaveLength(4);
    expect(RAMP[0]).toBe("#0a0e18");
    expect(new Set(RAMP).size).toBe(4);
  });

  test("배경·가장자리·중간 스톱", () => {
    for (const [name, hex] of [
      ["deepSpace.bg", deepSpace.bg],
      ["deepSpace.bgEdge", deepSpace.bgEdge],
      ["deepSpace.bgMid", deepSpace.bgMid],
      ["deepSpace.bgGlow", deepSpace.bgGlow],
    ] as const) {
      expect(`${name}=${hex}`).toBe(`${name}=${inRamp(hex) ? hex : "램프 밖"}`);
    }
  });

  test("패널과 경계", () => {
    for (const [name, hex] of [
      ["semantic.surface", semantic.surface],
      ["semantic.surfaceAlt", semantic.surfaceAlt],
      ["semantic.border", semantic.border],
      ["deepSpace.card", deepSpace.card],
      ["deepSpace.cardPressed", deepSpace.cardPressed],
      ["deepSpace.cardLine", deepSpace.cardLine],
    ] as const) {
      expect(`${name}=${hex}`).toBe(`${name}=${inRamp(hex) ? hex : "램프 밖"}`);
    }
  });

  test("화면에서 가장 넓은 두 색(성운 바닥·무대 바닥)도 램프 안에 있다", () => {
    // 이 둘이 SbStarfield 의 바닥과 홈 무대를 칠한다. 표면 토큰을 다 맞춰도
    // 이 둘이 램프 밖이면 화면 전체가 캐논에서 끌려 내려간다(실측으로 확인됨).
    expect(`cosmicBase=${m3.accent.cosmicBase}`).toBe(
      `cosmicBase=${inRamp(m3.accent.cosmicBase) ? m3.accent.cosmicBase : "램프 밖"}`,
    );
    expect(`stageFloor=${m3.accent.stageFloor}`).toBe(
      `stageFloor=${inRamp(m3.accent.stageFloor) ? m3.accent.stageFloor : "램프 밖"}`,
    );
  });

  test("우주 워시 그라디언트의 스톱도 전부 램프 안", () => {
    // ⚠ 그라디언트 **구조**는 아직 남아 있다. PIXEL-CLAY 는 불투명도 대신 디더/색
    // 밴딩을 요구하므로 이건 색만 맞춘 중간 단계고, 밴딩 전환은 컴포넌트 작업이다.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { deepSpaceGradients } = require("@/lib/theme/tokens") as {
      deepSpaceGradients: { screenBg: readonly string[] };
    };
    for (const stop of deepSpaceGradients.screenBg) {
      expect(`stop=${stop}`).toBe(`stop=${inRamp(stop) ? stop : "램프 밖"}`);
    }
  });
});

// <Text variant> 의 폰트 규율 세 가지를 지킨다 (PIXEL-CLAY, Simon 2026-09-05).
//
// 1. 격자: 각 변형이 고르는 M3 역할의 크기는 그 얼굴 고유 크기의 **정수배**여야
//    한다. Galmuri 는 비트맵이라 분수 배율이면 흐려진다. 문자열을 핀하지 않고
//    m3.type + typeface 의 격자표로 실제 나눗셈을 한다 -> 역할을 바꿔도 격자만
//    지키면 통과하고, 격자를 벗어나면 어느 역할이든 걸린다.
// 2. 위계: display > heading > body > caption > subtle 이 크기로 엄격히 내려간다.
//    (같은 크기 두 변형은 위계가 사라진 것.)
// 3. 읽기 쉬운 글꼴 정책(Simon 2026-08-21, "본문만"): readable 은 body·subtle 만
//    Pretendard 로 바꾸고 크롬은 Galmuri 로 남긴다. 픽셀 모드에서는 fontWeight 를
//    내보내지 않는다(합성 볼드가 픽셀을 번지게 한다).
//
// 렌더 테스트는 막혀 있으므로(RN 0.85 upstream) 1·2 는 값으로, 3 은 소스로 본다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { m3, type M3TypeRole } from "@/lib/theme/m3";
import { NATIVE_PX, faceForSize } from "@/components/m3/typeface";

const src = readFileSync(resolve(__dirname, "../Text.tsx"), "utf8").replace(/\r\n/g, "\n");

/** 소스의 VARIANT_ROLE 블록에서 변형 -> 역할 이름을 읽는다. */
function readVariantRoles(): Record<string, M3TypeRole> {
  const start = src.indexOf("const VARIANT_ROLE");
  const end = src.indexOf("};", start);
  const block = src.slice(start, end);
  const out: Record<string, M3TypeRole> = {};
  for (const m of block.matchAll(/(\w+):\s*"(\w+)"/g)) out[m[1]] = m[2] as M3TypeRole;
  return out;
}

const ORDER = ["display", "heading", "body", "caption", "subtle"] as const;

describe("가드가 진짜 소스를 읽는다", () => {
  test("Text.tsx 와 VARIANT_ROLE 블록이 있다", () => {
    expect(src.length).toBeGreaterThan(1500);
    expect(src).toContain("const VARIANT_ROLE");
    expect(Object.keys(readVariantRoles()).sort()).toEqual([...ORDER].sort());
  });
});

describe("1. 격자: 변형마다 얼굴 고유 크기의 정수배", () => {
  const roles = readVariantRoles();
  for (const variant of ORDER) {
    test(`${variant} -> ${roles[variant]}`, () => {
      const role = roles[variant];
      expect(m3.type).toHaveProperty(role);
      const size = m3.type[role].size;
      const face = faceForSize(size);
      const native = NATIVE_PX[face];
      expect({ variant, role, size, face, onGrid: size % native === 0 }).toEqual({ variant, role, size, face, onGrid: true });
    });
  }
});

describe("2. 위계: 크기가 엄격히 내려간다", () => {
  test("display > heading > body > caption > subtle", () => {
    const roles = readVariantRoles();
    const sizes = ORDER.map((v) => m3.type[roles[v]].size);
    for (let i = 1; i < sizes.length; i++) {
      expect({ from: ORDER[i - 1], to: ORDER[i], strictlyDown: sizes[i] < sizes[i - 1] }).toEqual({ from: ORDER[i - 1], to: ORDER[i], strictlyDown: true });
    }
  });
});

describe("3. 읽기 쉬운 글꼴 정책과 굵기", () => {
  test("readable 은 body·subtle 만 건드린다", () => {
    const m = /READING_VARIANTS[^=]*=\s*new Set<Variant>\(\[([^\]]*)\]\)/.exec(src);
    expect(m).not.toBeNull();
    const list = [...m![1].matchAll(/"(\w+)"/g)].map((x) => x[1]).sort();
    expect(list).toEqual(["body", "subtle"]);
  });

  test("readable 분기는 pixelEn(크롬)을 제외한다", () => {
    expect(src).toMatch(/const readable = fontStyle === "readable" && READING_VARIANTS\.has\(variant\) && !pixelEn;/);
  });

  test("픽셀 얼굴은 galmuriFor 가 고른다 (fontFamilies.pixelKo 직접 사용 금지)", () => {
    expect(src).toMatch(/galmuriFor\(role\.size, galmuriWeight\(v\.fontWeight\)\)/);
    expect(src).not.toContain("fontFamilies.pixelKo");
    expect(src).not.toContain("VARIANT_FONT");
  });

  test("fontWeight 는 readable 일 때만 나간다", () => {
    // 기본 스타일 객체에는 fontWeight 가 없고, readable 조건부로만 붙는다.
    expect(src).toMatch(/\{ color: palette\[color \?\? "text"\], fontSize: role\.size, fontFamily \}/);
    expect(src).toMatch(/readable && \{ fontWeight: v\.fontWeight \}/);
  });

  test("800/600 굵기는 Galmuri 가 가진 700/500 으로 접힌다", () => {
    expect(src).toMatch(/if \(w === "700" \|\| w === "800"\) return "700";/);
    expect(src).toMatch(/if \(w === "500" \|\| w === "600"\) return "500";/);
  });
});

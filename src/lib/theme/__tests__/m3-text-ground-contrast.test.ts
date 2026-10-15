// m3 글자 × 바탕 쌍 대비 (QA R2B-08, 2026-10-05).
//
// contrast-audit.test.ts 는 tokens.ts(cosmic · semanticLight) 쌍만 본다. 배송 화면은 m3.color 를
// 쓰고, 기본 다크에서 AA(보통 글자 4.5:1)에 못 미치는 조합이 세 화면에 있었다:
//   - /ops 연속 기록: onSurfaceVariant on primaryContainer 2.01:1
//   - /secondb 입력 자리표시자: 반투명 cyan 을 surfaceContainerLow 위에서 합성했는데 실제 바탕은
//     surfaceContainerHigh 라 2.41:1
//   - /sign-in 텍스트 링크 둘: primary on surfaceContainerHigh(bevel 기본 바탕) 4.16:1
// 아래는 (1) 고친 쌍이 AA 를 넘는지, (2) 피해야 할 쌍이 여전히 못 넘는지(넘게 되면 이 설명이
// 낡은 것이다), (3) 화면이 고친 쌍을 실제로 쓰는지를 지킨다. 망원경 배율 눈금의 어두운 숫자는
// 가장자리 장식 페이드라 결함이 아니다(값은 가운데 readout 이 전한다).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { contrastRatio } from "../contrast";
import { m3 } from "../m3";

const AA = 4.5;
const c = m3.color;
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

describe("m3 글자 × 바탕 - 배송 화면이 기대는 쌍", () => {
  test("고친 쌍은 AA 보통 글자(4.5:1)를 넘는다 [GUARD]", () => {
    // /ops 연속 기록은 이제 구획 제목 줄의 기본 화면 바탕에 놓인다.
    expect(contrastRatio(c.onSurfaceVariant, c.surface)).toBeGreaterThanOrEqual(AA);
    // /secondb 입력 자리표시자 on 입력 알약
    expect(contrastRatio(c.onSurfaceVariant, c.surfaceContainerHigh)).toBeGreaterThanOrEqual(AA);
    // /sign-in 텍스트 링크 on 패널 바탕, 그 위 보조 문구
    expect(contrastRatio(c.primary, c.surfaceContainer)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(c.onSurfaceVariant, c.surfaceContainer)).toBeGreaterThanOrEqual(AA);
  });

  test("피해야 할 쌍은 여전히 AA 에 못 미친다 [FLAGGED]", () => {
    expect(contrastRatio(c.onSurfaceVariant, c.primaryContainer)).toBeLessThan(3);
    expect(contrastRatio(c.primary, c.surfaceContainerHigh)).toBeLessThan(AA);
  });
});

describe("화면이 고친 쌍을 쓴다 (변이 검증: 고치기 전 줄로 되돌리면 빨갛다)", () => {
  test("/ops 연속 기록은 기본 화면 바탕 위의 보조 글자다", () => {
    const ops = read("src/screens/deepspace/dds-ops-screen.tsx");
    expect(ops).not.toContain("styles.heroContent");
    expect(ops).toContain("sectionSummary: { color: m3.color.onSurfaceVariant,");
    expect(ops).toContain('style={styles.sectionSummary}>{trailing}</Text>');
  });

  test("/secondb 입력 알약: 자리표시자는 onSurfaceVariant, 알약 안 반투명 색은 실제 바탕에서 합성한다", () => {
    const secondb = read("src/app/secondb.tsx");
    expect(secondb).toContain("placeholderTextColor={m3.color.onSurfaceVariant}");
    expect(secondb).not.toContain("placeholderTextColor={sbAlpha(");
    expect(secondb).toContain(
      "const pillAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.color.surfaceContainerHigh);",
    );
    expect(secondb).toContain("backgroundColor: m3.color.surfaceContainerHigh,");
    expect(secondb).toContain("pillAlpha(deepSpace.text, 0.6)");
    expect(secondb).toContain("pillAlpha(lensAccent, 0.18)");
  });

  test("/sign-in 텍스트 링크 둘은 패널 바탕 위에 있다", () => {
    const signIn = read("src/screens/deepspace/dds-sign-in-screen.tsx");
    expect(signIn).toContain("const LINK_GROUND = m3.color.surfaceContainer;");
    expect(signIn.match(/background=\{LINK_GROUND\}/g)).toHaveLength(2);
    for (const content of ["contentStyle={styles.linkContent}", "contentStyle={styles.signUpContent}"]) {
      const at = signIn.indexOf(content);
      expect(at).toBeGreaterThan(-1);
      // 같은 PixelPressable 여는 태그 안(바로 앞)에 바탕이 있다.
      expect(signIn.slice(signIn.lastIndexOf("<PixelPressable", at), at)).toContain("background={LINK_GROUND}");
    }
    expect(signIn).toMatch(/linkText: \{\s*flex: 1,\s*color: m3\.color\.primary,/);
    expect(signIn).toMatch(/signUpText: \{\s*color: m3\.color\.primary,/);
  });
});

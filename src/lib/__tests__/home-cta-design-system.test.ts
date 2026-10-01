import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), "utf8");
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

describe("home CTA design-system wiring", () => {
  // ⚠ 2026-09-08: 이 파일이 못박던 것은 **레거시 홈**의 CTA 배선이었다 —
  // PremiumButton 네 개, HomePressable 의 80ms 불투명도 피드백, firstPiece ·
  // lookFirst · makeReadable · likeAsIs 라벨. 그 렌더러가 legacy/screens/index.tsx
  // 로 나갔고, **배송 홈에는 그 일곱 가지가 하나도 없다**(실측 0건).
  //
  // 없어진 것을 그냥 지우면 "홈에 첫 실행 안내가 있었다"는 사실까지 지운다.
  // 배송 홈이 그 자리에 두는 것은 **행동형 코치마크**다 — 첫 방문에 실제 세컨비
  // 머리에서 시작해 기록 화면의 메모·입력·담기까지 이어지고, "다시 보지 않기"로
  // 닫히며 설정에서 되돌릴 수 있다. 다른 물건이지 빈자리가 아니다. 그래서 이 검사는
  // 그쪽 배선을 못박고, 옛 배선이 **돌아오지 않았음**을 함께 확인한다.
  test("첫 실행 안내는 코치마크가 진다", () => {
    const shell = readRepoFile("src/components/deep-space/DeepSpaceShell.tsx");

    expect(shell).toContain("useCoachmarksGate(");
    expect(shell).toContain("<HomeCoachmarks");
    // 닫기는 소유자별 seen 기록으로 홈과 기록 화면에 즉시 반영된다.
    expect(countMatches(shell, /coachmarksDue === true/g)).toBeGreaterThanOrEqual(2);
  });

  test("레거시 홈의 CTA 배선은 돌아오지 않았다", () => {
    const shell = readRepoFile("src/components/deep-space/DeepSpaceShell.tsx");
    const home = readRepoFile("src/components/deep-space/ConstellationHome.tsx");
    for (const source of [shell, home]) {
      expect(source).not.toContain("HomePressable");
      expect(source).not.toContain("PremiumButton");
      expect(source).not.toContain('t("firstPiece")');
      expect(source).not.toContain('t("lookFirst")');
    }
  });
});

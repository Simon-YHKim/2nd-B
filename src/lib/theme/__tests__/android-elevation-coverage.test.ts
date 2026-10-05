import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Android elevation coverage", () => {
  // 이 파일의 규칙: android elevation 가드는 **레거시 변형이 남아 있는 동안만** 그 화면에
  // 남는다. 딥스페이스 화면은 elevation 이 아니라 테두리 + 채움 + 베벨로 깊이를 낸다.
  //
  // 2026-10-05: 롤백 레버 EXPO_PUBLIC_UI 가 없어지며(Simon 결정 Q-261004-11 C) 남아 있던
  // 레거시 변형이 전부 빠졌다 - reset-password(인증 폼) · data · inbox(카드 목록) ·
  // big-five · manual(보조 카드). 그래서 앞의 두 묶음("auth form containers" ·
  // "main card/list cluster")은 지킬 화면이 없어 은퇴했고, 마지막 묶음에는 배송
  // /attachment 설문만 남는다 - 그 설문의 문항 카드는 레거시 이름과 무관하게 배송되는
  // 화면이고 elevation 카드를 쓴다.
  it("keeps the shipped attachment survey cards on the shared card elevation", () => {
    // Closes the remaining Android-flat gap surfaced after the first rollout:
    // assessment + info screens that had iOS shadow* but no Android elevation.
    const secondaryScreens = ["src/app/attachment.tsx"];

    for (const file of secondaryScreens) {
      expect(readProjectFile(file)).toContain("androidElevationStyle(androidElevation.card)");
    }
  });
});

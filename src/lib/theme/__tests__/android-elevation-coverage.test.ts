import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Android elevation coverage", () => {
  it("keeps auth form containers on the shared auth elevation", () => {
    // data / theme / permissions / support left these lists on 2026-09-08 for the
    // same reason complete-profile did: their legacy variant retired
    // (legacy/screens/INDEX.md), so the route now renders only the deep-space
    // screen, which carries depth as border + fill + bevel rather than android
    // elevation. The rule this file already states - the guard stays while a
    // legacy variant does - is what took them off.
    // complete-profile was converted in-place to the deep-space shell (like the
    // onboarding gate, which is also not listed here): it uses deep-space depth
    // (border + bgMid fill + glow) instead of the legacy premium android
    // elevation card, and must not import gameboy-tokens. The remaining screens
    // still carry their legacy variant, so the elevation guard stays on them.
    // sign-in 은 2026-09-08 에 이 목록에서 나갔다. 위 주석의 규칙 그대로다 —
    // 레거시 렌더러가 legacy/screens/sign-in.tsx 로 나가면서 라우트는 딥스페이스
    // 화면만 렌더하고, 그 화면은 android elevation 이 아니라 테두리 + 채움 + 베벨로
    // 깊이를 낸다(실측: 라이브 화면에 androidElevation 0건).
    const authScreens = ["src/app/(auth)/reset-password.tsx"];

    for (const file of authScreens) {
      expect(readProjectFile(file)).toContain("androidElevationStyle(androidElevation.authForm)");
    }
  });

  it("keeps the main card/list cluster on the shared card elevation", () => {
    // research 는 이 목록에서 나갔다. 위 주석의 규칙 그대로다 — 레거시 렌더러가
    // legacy/screens/research.tsx 로 나가면서 라우트는 딥스페이스 화면만 렌더하고,
    // 그 화면은 android elevation 이 아니라 테두리 + 채움 + 베벨로 깊이를 낸다
    // (실측: 라이브 화면에 androidElevation 0건).
    const cardScreens = [
      { file: "src/app/data.tsx", minCount: 1 },
      { file: "src/app/inbox.tsx", minCount: 1 },
    ];

    for (const { file, minCount } of cardScreens) {
      const count = readProjectFile(file).split("androidElevationStyle(androidElevation.card)").length - 1;
      expect(count).toBeGreaterThanOrEqual(minCount);
    }
  });

  it("keeps secondary card screens on the shared card elevation", () => {
    // Closes the remaining Android-flat gap surfaced after the first rollout:
    // assessment + info screens that had iOS shadow* but no Android elevation.
    const secondaryScreens = [
      "src/app/big-five.tsx",
      "src/app/attachment.tsx",
      "src/app/manual.tsx",
    ];

    for (const file of secondaryScreens) {
      expect(readProjectFile(file)).toContain("androidElevationStyle(androidElevation.card)");
    }
  });
});

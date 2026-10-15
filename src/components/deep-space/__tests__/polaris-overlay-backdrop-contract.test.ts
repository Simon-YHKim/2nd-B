// 북극성 카드가 아래 화면을 비추는 것은 홈 위에서 열렸을 때뿐인가 (QA 261004 D-05).
//
// /core-brain 은 transparentModal 이라 아래 화면이 마운트된 채 남는다. 예전
// 판정은 "뒤로 갈 곳이 있다" 하나라서 /records · /profile · 빈 상태의 replace ·
// /persona 리다이렉트로 열면 그 화면의 글자가 디더 사이로 카드 머리줄에 겹쳤다.
// 이제는 홈의 진입점만 overlay=home 을 붙이고, 카드는 그 표시와 뒤로 갈 곳이
// 둘 다 있을 때만 아래를 비춘다(/dashboard 와 같은 규칙).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { OVERLAY_HOME, isOverHome } from "@/lib/nav/over-home";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("isOverHome", () => {
  it("홈이 열었고 그 홈이 아래에 있을 때만 참이다", () => {
    expect(isOverHome(OVERLAY_HOME, true)).toBe(true);
  });

  it("뒤로 갈 곳이 있어도 홈 표시가 없으면 거짓이다 - /records · /profile · 리다이렉트", () => {
    expect(isOverHome(undefined, true)).toBe(false);
    expect(isOverHome("records", true)).toBe(false);
    expect(isOverHome(["home"], true)).toBe(false);
  });

  it("홈 표시가 있어도 아래에 아무것도 없으면(새로고침 · 딥링크) 거짓이다", () => {
    expect(isOverHome(OVERLAY_HOME, false)).toBe(false);
  });
});

describe("배선", () => {
  const overlay = read("src/components/deep-space/PolarisCardOverlay.tsx");
  const shell = read("src/components/deep-space/DeepSpaceShell.tsx");

  it("카드는 overlay 파라미터와 뒤로 갈 곳을 함께 본다", () => {
    expect(overlay).toContain('const { overlay } = useScreenParams<{ overlay?: string }>();');
    expect(overlay).toContain("const [overSky] = useState(() => isOverHome(overlay, router.canGoBack()));");
    expect(overlay).toContain("transparentBackdrop={overSky}");
    // 예전 판정(뒤로 갈 곳만 보는 것)은 남아 있지 않다.
    expect(overlay).not.toContain("useState(() => router.canGoBack())");
  });

  it("홈의 북극성 진입은 overlay=home 을 붙인다 - /dashboard 진입과 같은 모양", () => {
    expect(shell).toContain(
      'onPolarisPress={() => router.push({ pathname: "/core-brain", params: { overlay: "home" } })}',
    );
    expect(shell).toContain('router.push({ pathname: "/dashboard", params: { overlay: "home", app: "notifications" } })');
  });

  it("홈이 아닌 진입점은 overlay=home 을 붙이지 않는다", () => {
    for (const file of [
      "src/screens/deepspace/dds-wiki-records-screens.tsx",
      "src/app/ratifications.tsx",
      "src/app/brightness.tsx",
      "src/app/persona.tsx",
      "src/app/trinity.tsx",
    ]) {
      const source = read(file);
      expect({ file, opensPolaris: source.includes('"/core-brain"') }).toEqual({ file, opensPolaris: true });
      expect({ file, claimsHome: /core-brain[^\n]*overlay/.test(source) }).toEqual({ file, claimsHome: false });
    }
  });

  it("닫기는 그대로다 - 뒤로 갈 곳이 있으면 뒤로, 없으면 홈", () => {
    expect(overlay).toContain("if (router.canGoBack()) router.back();");
  });
});

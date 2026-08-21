// 저시력 옵션이 **실제로 닿는가** (Simon 결정 2026-08-21, 질문 2 = A "본문만").
//
// 이 테스트가 필요한 이유는 이 옵션이 **켜도 아무 일이 없던 상태로 오래 있었기
// 때문**이다. `src/components/ui/Text.tsx` 가 옵션을 읽긴 했는데, 이식된 화면은
// 얼굴을 `m3TextStyle()` 로 만들어 `style` prop 에 넘겼고 그 style 이 배열 뒤에
// 와서 덮어썼다. 설정 화면의 토글은 멀쩡히 움직이는데 화면은 그대로였다.
//
// 그래서 여기서 보는 것은 "옵션이 존재하는가"가 아니라 **"본문 얼굴이 바뀌고
// 크롬 얼굴은 안 바뀌는가"** 다.
import { setFontStyle } from "@/lib/settings/readable-font";
import { m3TextStyle } from "../typeface";
import { fontFamilies } from "@/theme/typography";

const READING = ["bodyLarge", "bodyMedium", "bodySmall"] as const;
const CHROME = [
  "labelLarge",
  "labelMedium",
  "labelSmall",
  "titleLarge",
  "titleMedium",
  "titleSmall",
  "headlineLarge",
  "headlineMedium",
  "headlineSmall",
  "displayLarge",
  "displayMedium",
  "displaySmall",
] as const;

const isGalmuri = (family: string) => /^Galmuri/.test(family);

afterEach(() => setFontStyle("pixel"));

describe("기본값(pixel)에서는 전부 Galmuri 다", () => {
  it.each([...READING, ...CHROME])("%s", (role) => {
    setFontStyle("pixel");
    expect(isGalmuri(m3TextStyle(role).fontFamily)).toBe(true);
  });

  it("픽셀 얼굴에는 fontWeight 을 내보내지 않는다 (굵기가 얼굴 이름 안에 있다)", () => {
    setFontStyle("pixel");
    expect(m3TextStyle("bodyMedium")).not.toHaveProperty("fontWeight");
    expect(m3TextStyle("labelLarge")).not.toHaveProperty("fontWeight");
  });
});

describe("readable 에서 읽는 글만 벡터 얼굴로 바뀐다", () => {
  it.each(READING)("%s 은 바뀐다", (role) => {
    setFontStyle("readable");
    expect(m3TextStyle(role).fontFamily).toBe(fontFamilies.readable);
  });

  it.each(CHROME)("%s 은 안 바뀐다 (픽셀 정체성은 크롬이 진다)", (role) => {
    setFontStyle("readable");
    expect(isGalmuri(m3TextStyle(role).fontFamily)).toBe(true);
  });

  it("벡터 얼굴로 바뀐 자리에는 fontWeight 을 준다", () => {
    setFontStyle("readable");
    // Pretendard 는 얼굴 이름이 아니라 스타일로 굵어진다. 이걸 빼면 굵은 본문이
    // 얇게 나오고, 그건 저시력 사용자에게 정확히 반대 방향이다.
    expect(m3TextStyle("bodyLarge")).toHaveProperty("fontWeight");
  });

  it("얼굴만 바꾸고 격자(크기·행간·자간)는 그대로 둔다", () => {
    setFontStyle("pixel");
    const pixel = m3TextStyle("bodyMedium");
    setFontStyle("readable");
    const readable = m3TextStyle("bodyMedium");
    expect(readable.fontSize).toBe(pixel.fontSize);
    expect(readable.lineHeight).toBe(pixel.lineHeight);
    expect(readable.letterSpacing).toBe(pixel.letterSpacing);
    expect(readable.fontFamily).not.toBe(pixel.fontFamily);
  });
});

describe("설정을 바꾸면 지금 보고 있는 화면이 따라온다", () => {
  // `m3TextStyle()` 은 훅이 아니라 스스로 다시 그려지지 못한다. 공유 셸이
  // 구독해야 설정을 바꾸고 화면을 떠났다 돌아오지 않아도 반영된다.
  // 렌더 테스트가 막혀 있으므로(RN 0.85 + jest) 소스로 확인한다.
  const shell = require("node:fs")
    .readFileSync(
      require("node:path").join(__dirname, "..", "..", "deep-space", "DeepSpaceScreen.tsx"),
      "utf8",
    )
    .replace(/\r\n/g, "\n");

  it("DeepSpaceScreen 이 useFontStyle() 을 구독한다", () => {
    expect(shell).toContain('from "@/lib/settings/readable-font"');
    expect(shell).toMatch(/\n\s*useFontStyle\(\);/);
  });
});

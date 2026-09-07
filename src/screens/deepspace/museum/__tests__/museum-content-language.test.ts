import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { CANON_MUSEUM_LANGUAGE } from "@/lib/canon/museum";
import { MUSEUM, museumDetailById } from "../museum-timeline-data";
import { museumContentLanguage } from "../museum-translation";

// 뮤지엄 본문의 언어가 보조기술에 정확히 전달되는지를 잡는다.
//
// ⚠ 이 파일이 세운 명제는 2026-09-07 에 **바뀌었다.** 원래 명제는
// "캐논은 한국어 전용이고 화면은 그 사실 하나를 선언한다" 였고, 그래서
// `accessibilityLanguage={CANON_MUSEUM_LANGUAGE}` 라는 **리터럴**을 박아 뒀다.
// Simon 이 R24-MUSEUM-04 를 ②(영어 번역을 추가한다)로 결정하면서 그 전제가
// 사라졌다 - 타임라인은 이제 **부분 번역**이고, 사건마다 언어가 다르다.
//
// 새 명제: **화면은 언어를 스스로 적지 않고 물어보며, 그 답은 실제로 그려진
// 언어와 같다.** 상수를 사건별 결정으로 바꾼 것이지 검사를 느슨하게 한 것이
// 아니다 - 오히려 "로케일이 en 이면 en 이라고 적는다" 는 더 쉬운 구현을
// 이 검사가 막는다(번역 없는 카드가 영어라고 주장하게 되기 때문이다).
// 짝이 되는 검사는 museum-translation.test.ts 에 있다.
//
// 원래 이유는 그대로다: 영어 사용자의 스크린리더가 한국어 글자를 영어 목소리로
// 읽으면 안 읽히는 것이 아니라 뜻 없는 소리가 된다.
//
// ⚠ 실측한 한계: React Native Web 은 lang 도 accessibilityLanguage 도 DOM 으로
// 넘기지 않는다(forwardedProps 에 둘 다 없다). 그래서 이 수정은 네이티브에서만
// 효력이 있고, 웹에는 RN prop 경로가 존재하지 않는다. 그 사실을 여기 못박아,
// 다음 사람이 "웹에서도 되겠지" 라고 읽지 않게 한다.
const SCREEN = resolve(__dirname, "../MuseumTimelineScreen.tsx");
const SOURCE = readFileSync(SCREEN, "utf8");
const AST = ts.createSourceFile(SCREEN, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/**
 * 주어진 속성을 가진 JSX 요소들의 **파싱된 속성 맵**.
 *
 * ⚠ 처음에는 여는 태그의 텍스트를 돌려주고 거기에 "accessibilityLanguage" 가
 * 들어 있는지 물었다. 그 속성 위의 주석에 그 단어가 있어서, 속성을 지워도 검사가
 * 통과했다. 이 저장소가 네 번 겪은 주석發 거짓양성이고, 그 경고를 계속 써 온
 * 사람이 그대로 밟았다. 텍스트가 아니라 속성을 읽는다.
 */
function elementsWith(attribute: string): Map<string, string>[] {
  const found: Map<string, string>[] = [];
  walk(AST, (node) => {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;
    if (!opening) return;
    const attributes = new Map<string, string>();
    for (const property of opening.attributes.properties) {
      if (ts.isJsxAttribute(property)) attributes.set(property.name.getText(AST), property.initializer?.getText(AST) ?? "true");
    }
    if (attributes.has(attribute)) found.push(attributes);
  });
  return found;
}

describe("캐논이 한국어 전용이라는 사실 (번역 층이 별도 파일인 이유)", () => {
  test("사건 본문에 영어판이 없다 - 레인 이름과 달리", () => {
    // 레인은 label(ko) 과 en 을 둘 다 갖는다. 사건은 title·sub·body 뿐이다.
    for (const event of MUSEUM.slice(0, 5)) {
      expect(typeof event.title).toBe("string");
      expect(Object.keys(event)).not.toContain("titleEn");
      expect(Object.keys(event)).not.toContain("en");
    }
  });

  test("상세도 마찬가지다", () => {
    const detail = museumDetailById(MUSEUM[0].id);
    expect(detail).toBeDefined();
    expect(Object.keys(detail ?? {}).some((k) => /en$/i.test(k))).toBe(false);
  });

  test("캐논 층이 그 언어를 이름으로 선언한다", () => {
    // 화면이 "ko" 를 직접 적으면 캐논이 바뀔 때 화면이 거짓말을 한다.
    // 팩 옆(canon/museum.ts)에 두는 이유는 그것이 이 언어의 소유자이고,
    // museum-timeline-data.ts 는 museum-pixel-screen.test.ts 가 바이트로
    // 고정해 둔 파일이라 상수 하나 넣자고 그 가드를 쓸 이유가 없어서다.
    expect(CANON_MUSEUM_LANGUAGE).toBe("ko");
  });

  test("번역 층은 캐논을 고치지 않고 그 위에 얹힌다", () => {
    // 캐논 팩은 픽셀 계약이다. 번역이 들어왔어도 캐논 사건은 여전히 한국어여야
    // 한다 - 영어로 바뀌어 있으면 누군가 계약 자체를 고친 것이고, 그건 이
    // 결정이 승인한 일이 아니다(별도 층을 만든 이유가 그것이다).
    //
    // 제목이 아니라 body 를 본다: 제목은 "GPT-3" 처럼 원래 로마자인 것이
    // 있어도 body 는 43건 전부 한국어 산문이다.
    const notKorean = MUSEUM.filter((event) => !/[가-힣]/.test(event.body)).map((e) => e.id);
    expect(notKorean).toEqual([]);
    expect(MUSEUM.every((event) => !("titleEn" in event))).toBe(true);
  });
});

describe("본문이 실제로 그려진 언어로 표시된다", () => {
  test("타임라인 노드가 사건별로 언어를 묻는다", () => {
    const nodes = elementsWith("accessibilityLabel")
      .filter((attributes) => (attributes.get("accessibilityLabel") ?? "").includes("event.ylabel"));
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      // 사건 id 가 들어간 호출이어야 한다. `{locale}` 이나 상수는 둘 다
      // "이 카드에 실제로 그려진 언어" 가 아니다.
      expect(node.get("accessibilityLanguage")).toBe("{museumContentLanguage(event.id, locale)}");
    }
  });

  test("상세 시트가 선택된 사건의 언어를 단다", () => {
    // 시트 컨테이너에 한 번 걸어 그 안의 본문을 전부 덮는다. 본문이 한 사건에서
    // 통째로 오므로 하나로 충분하다. 여기서도 텍스트가 아니라 속성을 본다.
    const sheets = elementsWith("accessibilityViewIsModal");
    expect(sheets.length).toBe(1);
    expect(sheets[0].get("accessibilityLanguage")).toBe("{selectedLanguage}");
  });

  test("화면이 언어를 직접 적지 않는다", () => {
    const tagged = elementsWith("accessibilityLanguage");
    expect(tagged.length).toBe(2);
    for (const element of tagged) {
      const value = element.get("accessibilityLanguage") ?? "";
      expect(value).not.toMatch(/"(ko|en)"|'(ko|en)'/);
      expect(value).toMatch(/museumContentLanguage|selectedLanguage/);
    }
  });

  test("해석기가 실제로 두 답을 낸다 - 한 답만 내면 표시가 무의미하다", () => {
    // 모든 입력에 같은 답을 주는 신호는 신호가 아니다. 번역이 있는 id 와
    // 없는 id 가 영어 로케일에서 다른 답을 내는지 직접 확인한다.
    const translated = MUSEUM.find((event) => museumContentLanguage(event.id, "en") === "en");
    const untranslated = MUSEUM.find((event) => museumContentLanguage(event.id, "en") === "ko");
    expect(translated).toBeDefined();
    expect(untranslated).toBeDefined();
    // 한국어 로케일에서는 둘 다 ko 다.
    expect(museumContentLanguage(translated!.id, "ko")).toBe("ko");
    expect(museumContentLanguage(untranslated!.id, "ko")).toBe("ko");
  });

  test("번역되는 크롬에는 달지 않는다", () => {
    // 제목·힌트는 로케일 번들에서 오므로 한국어라고 표시하면 그게 거짓이 된다.
    const chrome = SOURCE.match(/title=\{t\("deepspace:museum\.title"\)\}/);
    expect(chrome).not.toBeNull();
    // 언어를 단 요소는 정확히 둘이고 둘 다 한국어 본문이다. 크롬에는 없다.
    expect(elementsWith("accessibilityLanguage").length).toBe(2);
  });
});

describe("웹에는 경로가 없다는 사실을 못박는다", () => {
  test("React Native Web 이 lang 도 accessibilityLanguage 도 넘기지 않는다", () => {
    const forwarded = readFileSync(
      resolve(__dirname, "../../../../../node_modules/react-native-web/dist/modules/forwardedProps/index.js"),
      "utf8",
    );
    expect(forwarded).not.toMatch(/\baccessibilityLanguage\b/);
    expect(forwarded).not.toMatch(/'lang':/);
  });

  test("그래서 이 수정은 네이티브 전용이라고 코드에 적혀 있다", () => {
    expect(SOURCE).toMatch(/React Native Web/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

import { CANON_MUSEUM_LANGUAGE } from "@/lib/canon/museum";
import { MUSEUM, museumDetailById } from "../museum-timeline-data";

// 영어 로케일에서도 뮤지엄 본문이 한국어인데, 화면이 그 사실을 보조기술에 알리지
// 않는 문제를 잡는다.
//
// 번역 여부는 제품 결정이고 이 회차가 정할 일이 아니다. 캐논이 스스로
// "KO canonical, canon KO copy verbatim - data, not chrome" 이라고 적고 있다.
// 하지만 그것과 별개로 지금 벌어지는 일이 하나 있다: 영어 사용자의 스크린리더가
// 한국어 글자를 영어 목소리로 읽는다. 안 읽히는 것이 아니라 뜻 없는 소리가 된다.
// 언어를 표시하는 것은 내용 결정이 아니라 접근성 정확성이다.
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

describe("캐논이 한국어 전용이라는 사실 (이 회차가 근거로 삼는 실측)", () => {
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
});

describe("한국어 본문이 그 언어로 표시된다", () => {
  test("타임라인 노드가 언어를 달고 있다", () => {
    const nodes = elementsWith("accessibilityLabel")
      .filter((attributes) => (attributes.get("accessibilityLabel") ?? "").includes("event.ylabel"));
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) expect(node.get("accessibilityLanguage")).toBe("{CANON_MUSEUM_LANGUAGE}");
  });

  test("상세 시트가 언어를 달고 있다", () => {
    // 시트 컨테이너에 한 번 걸어 그 안의 한국어 본문을 전부 덮는다. 여기서도
    // 텍스트가 아니라 속성을 본다.
    const sheets = elementsWith("accessibilityViewIsModal");
    expect(sheets.length).toBe(1);
    expect(sheets[0].get("accessibilityLanguage")).toBe("{CANON_MUSEUM_LANGUAGE}");
  });

  test("화면이 언어를 직접 적지 않고 캐논 층에서 가져온다", () => {
    const tagged = elementsWith("accessibilityLanguage");
    expect(tagged.length).toBe(2);
    for (const element of tagged) expect(element.get("accessibilityLanguage")).toBe("{CANON_MUSEUM_LANGUAGE}");
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

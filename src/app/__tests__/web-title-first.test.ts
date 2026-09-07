// 서빙되는 페이지의 **첫** <title> 이 비지 않아야 한다.
//
// expo-router 의 vendored react-helmet-async 가 <head> 맨 앞(바이트 38)에
// <title data-rh="true"> 를 넣고, HTML 규칙상 **먼저 나온 title 이 이긴다**.
// +html.tsx 가 쓰는 정적 <title> 은 그 뒤(257)라 읽히지 않는다.
//
// 그 helmet 태그는 오래 비어 있었다 — `expo-router/head` 의 <Head> 는
// useIsFocused() 가 거짓이면 null 을 돌려주는데, 정적 export 의 셸은 루트
// 레이아웃의 InlineLoader 분기라 **화면이 하나도 안 그려진다.**
//
// 그래서 루트 레이아웃이 같은 helmet 인스턴스에 직접 제목을 먹인다(SITE_HEAD).
// 대조 실험 2026-09-08: 같은 트리에서 _layout.tsx 만 바꿔 두 번 export —
// 바이트 38 이 before 는 빈 문자열, after 는 "2nd-Brain · 기록으로 알아가는 나".
//
// ⚠ 이 검사가 지키는 것은 "SITE_HEAD 가 **두 분기 모두**에 있다" 이다.
// 한쪽에만 두면 그 분기에서 다시 빈 제목이 나가고, export 가 어느 분기에
// 착지하는지는 폰트·i18n 준비 타이밍에 달려 있어 조용히 뒤집힌다.
// 렌더 테스트로는 못 잡는다 — 이 저장소는 RN 0.85 upstream 때문에 컴포넌트
// 렌더 테스트를 막아두었다. 그래서 소스를 읽어 고정한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8").replace(/\r\n/g, "\n");

const layout = read("../_layout.tsx");
const html = read("../+html.tsx");

/** 루트 게이트의 로더 분기 본문 (if (...) { ... } 안쪽). */
function loaderBranch(): string {
  const gate = layout.indexOf("if ((!fontsLoaded && !fontError) || !i18nReady)");
  if (gate < 0) throw new Error("루트 게이트를 못 찾았다 — 조건이 바뀌었으면 이 검사부터 고칠 것");
  const rest = layout.slice(gate);
  const end = rest.indexOf("\n  }");
  if (end < 0) throw new Error("로더 분기의 끝을 못 찾았다");
  return rest.slice(0, end);
}

/** 게이트를 통과한 뒤의 본 트리. */
function mainBranch(): string {
  const marker = layout.indexOf("<GestureHandlerRootView");
  if (marker < 0) throw new Error("본 트리의 루트를 못 찾았다");
  return layout.slice(marker);
}

describe("서빙되는 첫 <title> 은 비어 있지 않다", () => {
  it("제목을 vendored helmet 에 직접 먹인다", () => {
    // 다른 helmet 패키지를 새로 들이면 태그가 **하나 더** 생길 뿐,
    // 이미 나가 있는 바이트 38 의 태그는 그대로 빈다.
    expect(layout).toContain('from "expo-router/vendor/react-helmet-async/lib"');
    expect(layout).toMatch(/<Helmet>\s*<title>\{SITE_TITLE\}<\/title>\s*<\/Helmet>/);
  });

  it("SITE_HEAD 가 로더 분기에 있다 — export 가 착지하는 분기다", () => {
    expect(loaderBranch()).toContain("{SITE_HEAD}");
  });

  it("SITE_HEAD 가 본 트리에도 있다 — 게이트 통과 후에도 제목이 유지된다", () => {
    expect(mainBranch()).toContain("{SITE_HEAD}");
  });

  it("게이트 조건 자체는 건드리지 않았다", () => {
    // 이전 세션이 보류한 이유가 "부트 경로(#1626/#1646)를 바꾸게 된다" 였다.
    // 이 수정의 전제는 조건을 그대로 둔다는 것이므로, 조건을 고정한다.
    expect(layout).toContain("if ((!fontsLoaded && !fontError) || !i18nReady) {");
  });

  it("런타임 대입은 남아 있다 — helmet 없는 런타임과 클라이언트 네비게이션용", () => {
    expect(layout).toContain("document.title = SITE_TITLE;");
  });

  it("+html.tsx 가 helmet 태그를 '비어 있다'고 더 이상 주장하지 않는다", () => {
    // 고쳐진 사실을 문서가 옛말로 설명하면, 다음 사람이 이 검사를 지우게 된다.
    const note = html.slice(html.indexOf("NOTE on the <title>"));
    expect(note).toContain("used to be EMPTY");
    expect(note).not.toMatch(/It is empty because/);
  });
});

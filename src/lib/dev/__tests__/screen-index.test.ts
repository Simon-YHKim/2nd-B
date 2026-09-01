// 개발자 화면 목록이 실제 라우트와 어긋나지 않는지 본다.
//
// 이 목록은 손으로 관리한다(RN 은 파일 시스템을 못 읽으니 선택지가 없다).
// 손으로 관리하는 목록은 반드시 낡는다 — 그래서 낡는 순간 CI 가 막게 한다.
// 화면을 추가하고 목록에 안 적으면 실패하고, 목록에 적힌 화면 파일이
// 사라져도 실패한다. 양방향이라야 "빠뜨림"과 "유령 항목" 둘 다 잡는다.
//
// 개수가 아니라 **이름**으로 비교한다. `canon.test.ts` 의 51 핀처럼 개수만
// 세면 하나 지우고 하나 더할 때 조용히 통과한다.
//
// 진입 축(entry)·렌더 축(render)의 선언도 여기서 라우트 **소스를 읽어** 대조한다.
// 선언이 실제 분기와 어긋나면 목록이 거짓말을 하는 것이므로 CI 가 막는다.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

import {
  DEV_SCREEN_GROUPS,
  canOpenFromDevRegistry,
  designLabScreens,
  devScreens,
  entryRoleCounts,
  screenEntry,
  screenRender,
  type SpecialRenderBehavior,
  type SpecialScreenEntry,
} from "../screen-index";

const APP = join(process.cwd(), "src", "app");

/** 정상 진입이 아닌 화면 전부. 여기 없는 화면이 특수 entry 를 달면 실패한다. */
const EXPECTED_SPECIAL_ENTRY: Record<string, SpecialScreenEntry> = {
  journal: { kind: "legacy-link" },
  mbti: { kind: "legacy-link" },
  jarvis: { kind: "legacy-link" },
  "community/join/[token]": { kind: "deep-link", contract: "invite" },
  "peer/[token]": { kind: "deep-link", contract: "peer-response" },
  "(auth)/oauth-callback": { kind: "deep-link", contract: "oauth-callback" },
  canon: { kind: "dev", collection: "design-lab" },
  "deepspace-hub": { kind: "dev", collection: "design-lab" },
  "deepspace-preview": { kind: "dev", collection: "design-lab" },
  "deepspace-flowmap": { kind: "dev", collection: "design-lab" },
};

/** 실화면이 아닌 렌더 전부 — journal/mbti/jarvis 는 항상 redirect, 다섯은 UI 모드 분기. */
const EXPECTED_SPECIAL_RENDER: Record<string, SpecialRenderBehavior> = {
  journal: { kind: "redirect", to: "/capture", lifecycle: "retired" },
  mbti: { kind: "redirect", to: "/persona", lifecycle: "retired" },
  jarvis: { kind: "redirect", to: "/secondb", lifecycle: "retired" },
  imagine: {
    kind: "ui-mode-split",
    deepspace: { kind: "screen" },
    legacy: { kind: "redirect", to: "/secondb" },
  },
  discover: {
    kind: "ui-mode-split",
    deepspace: { kind: "screen" },
    legacy: { kind: "redirect", to: "/insights" },
  },
  persona: {
    kind: "ui-mode-split",
    deepspace: { kind: "redirect", to: "/core-brain" },
    legacy: { kind: "screen" },
  },
  seen: {
    kind: "ui-mode-split",
    deepspace: { kind: "screen" },
    legacy: { kind: "redirect", to: "/persona" },
  },
  trinity: {
    kind: "ui-mode-split",
    deepspace: { kind: "dev-gated-screen", productionRedirect: "/core-brain" },
    legacy: { kind: "screen" },
  },
};

/**
 * `src/lib/canon/__tests__/canon.test.ts` 의 appRoutes() 와 **같은 규칙**이어야
 * 한다. 규칙이 갈리면 두 가드가 서로 다른 앱을 검사하게 된다.
 */
function routeFiles(dir = APP, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("+")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...routeFiles(full, base ? `${base}/${entry.name}` : entry.name));
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    const name = entry.name.replace(/\.tsx$/, "");
    out.push(base ? `${base}/${name}` : name);
  }
  return out;
}

/** 라우트 파일의 default export 함수 선언 본문 소스. */
function defaultRouteFunctionSource(source: string, file: string): string {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = parsed.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      (statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword),
  );
  if (!declaration) throw new Error(`${file} does not export a default function declaration`);
  return declaration.getText(parsed);
}

/** 이름 붙은 함수의 첫 if 문 소스 — 외부 계약 정적 분기를 짚는 데 쓴다. */
function firstIfStatementSource(source: string, file: string, component: string): string {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = parsed.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === component,
  );
  const firstIf = declaration?.body?.statements.find(
    (statement): statement is ts.IfStatement => ts.isIfStatement(statement),
  );
  if (!firstIf) throw new Error(`${file} does not declare an if branch in ${component}`);
  return firstIf.getText(parsed);
}

function jsxTagNames(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      names.push(node.tagName.getText(parsed));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return names;
}

/** `<Redirect href="..." />` 와 `<Redirect href={{ pathname: "..." }} />` 의 목적지들. */
function redirectDestinations(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const destinations: string[] = [];
  const visit = (node: ts.Node) => {
    if (!ts.isJsxSelfClosingElement(node) || node.tagName.getText(parsed) !== "Redirect") {
      ts.forEachChild(node, visit);
      return;
    }
    const href = node.attributes.properties.find(
      (property): property is ts.JsxAttribute =>
        ts.isJsxAttribute(property) && property.name.getText(parsed) === "href",
    );
    const initializer = href?.initializer;
    if (initializer && ts.isStringLiteral(initializer)) destinations.push(initializer.text);
    if (
      initializer &&
      ts.isJsxExpression(initializer) &&
      initializer.expression &&
      ts.isObjectLiteralExpression(initializer.expression)
    ) {
      const pathname = initializer.expression.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) && property.name.getText(parsed) === "pathname",
      );
      if (pathname && ts.isStringLiteral(pathname.initializer)) destinations.push(pathname.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return destinations;
}

/** redirect 목적지가 등록된 앱 라우트인지 확인하고 그 파일명을 돌려준다. */
function destinationScreen(destination: string): string {
  const normalized = destination.replaceAll("\\", "/");
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[A-Za-z][A-Za-z\d+.-]*:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`redirect destination must be an app route: ${destination}`);
  }
  const match = devScreens().find((screen) => screen.href === normalized);
  if (!match) throw new Error(`redirect destination is not registered: ${destination}`);
  return match.file;
}

function moduleSpecifiers(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return parsed.statements
    .filter((statement): statement is ts.ImportDeclaration => ts.isImportDeclaration(statement))
    .map((statement) =>
      ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "",
    )
    .filter(Boolean);
}

describe("개발자 화면 목록", () => {
  it("앱의 모든 라우트를 정확히 한 번씩 담는다", () => {
    const listed = devScreens().map((s) => s.file).sort();
    const actual = routeFiles().sort();

    const missing = actual.filter((r) => !listed.includes(r));
    const ghost = listed.filter((r) => !actual.includes(r));

    // 실패했을 때 무엇을 고쳐야 하는지 바로 보이게 한다.
    expect({ 목록에서_빠진_화면: missing, 파일이_없는_항목: ghost }).toEqual({
      목록에서_빠진_화면: [],
      파일이_없는_항목: [],
    });
    expect(listed).toEqual(actual);
  });

  it("같은 화면을 두 번 적지 않는다", () => {
    const files = devScreens().map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it("모든 항목이 실제 파일을 가리킨다", () => {
    for (const s of devScreens()) {
      expect(existsSync(join(APP, `${s.file}.tsx`))).toBe(true);
    }
  });

  it("href 가 파일 경로가 아니라 실제 URL 이다", () => {
    for (const s of devScreens()) {
      // 그룹 세그먼트는 URL 에 나오지 않는다. `(auth)/sign-in` 을 그대로 밀면 404 다.
      expect(s.href).not.toContain("(");
      // 동적 구간은 견본값으로 채워져 있어야 한다. 패턴을 그대로 밀면
      // 라우터가 리터럴 "[id]" 를 파라미터 값으로 넘긴다.
      expect(s.href).not.toContain("[");
      expect(s.href.startsWith("/")).toBe(true);
    }
  });

  it("동적 라우트는 견본 표시를 달고 있다", () => {
    for (const s of devScreens()) {
      if (s.file.includes("[")) expect(s.sample).toBe(true);
    }
  });

  it("/star 견본이 실재하는 도메인 id 다", () => {
    // 다른 견본은 '없는 데이터' 상태를 보여주는 것이 목적이라 아무 값이나 되지만,
    // 도메인 별은 진짜로 그려지는 것을 봐야 하므로 유효한 id 여야 한다.
    const star = devScreens().find((s) => s.file === "star/[domain]");
    const domains = readFileSync(join(process.cwd(), "src", "lib", "persona", "domain-stars.ts"), "utf8");
    const id = star?.href.split("/").pop() ?? "";
    expect(id.length).toBeGreaterThan(0);
    expect(domains).toContain(`"${id}"`);
  });

  it("dev 표시가 실제 DevOnlyRoute 게이트와 일치한다", () => {
    // 표시가 틀리면 "왜 안 열리지" 를 화면 앞에서 다시 조사하게 된다.
    for (const s of devScreens()) {
      const src = readFileSync(join(APP, `${s.file}.tsx`), "utf8");
      expect({ file: s.file, dev: s.dev === true }).toEqual({
        file: s.file,
        dev: /<DevOnlyRoute>/.test(src),
      });
    }
  });

  it("auth 표시가 실제 로그인 리다이렉트와 일치한다", () => {
    for (const s of devScreens()) {
      const src = readFileSync(join(APP, `${s.file}.tsx`), "utf8");
      expect({ file: s.file, auth: s.auth === true }).toEqual({
        file: s.file,
        auth: /<Redirect href="\/sign-in" \/>/.test(src),
      });
    }
  });

  it("그룹 제목이 비어 있지 않고 중복되지 않는다", () => {
    const titles = DEV_SCREEN_GROUPS.map((g) => g.title);
    expect(titles.every((t) => t.trim().length > 0)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("모든 화면에 한국어 이름이 있다", () => {
    for (const s of devScreens()) expect(s.label.trim().length).toBeGreaterThan(0);
  });

  // ── 진입 축 ────────────────────────────────────────────────────────────

  it("특수 진입은 옛 링크 3 · 딥링크 3 · Design Lab 4 와 정확히 일치하고 전부 메모가 있다", () => {
    const special = Object.fromEntries(
      devScreens()
        .filter((screen) => screenEntry(screen).kind !== "standard")
        .map((screen) => [screen.file, screenEntry(screen)]),
    );
    expect(special).toEqual(EXPECTED_SPECIAL_ENTRY);
    for (const file of Object.keys(EXPECTED_SPECIAL_ENTRY)) {
      expect(devScreens().find((screen) => screen.file === file)?.note?.trim().length).toBeGreaterThan(0);
    }
  });

  it("진입 역할은 모든 route 를 standard + 옛 링크 + 딥링크 + Design Lab 으로 분할한다", () => {
    const counts = entryRoleCounts();
    expect({
      deepLink: counts.deepLink,
      legacyLink: counts.legacyLink,
      designLab: counts.designLab,
      devOnly: counts.devOnly,
    }).toEqual({
      deepLink: 3,
      legacyLink: 3,
      designLab: 4,
      devOnly: 8,
    });
    expect(counts.standard).toBe(counts.total - counts.deepLink - counts.legacyLink - counts.designLab);
    expect(counts.standard + counts.deepLink + counts.legacyLink + counts.designLab).toBe(counts.total);
    expect(counts.authRequired).toBe(devScreens().filter((screen) => screen.auth).length);
    // 옛 필드가 되살아나면 두 축이 다시 한 단어로 뭉개진 것이다.
    expect(devScreens().some((screen) => "orphan" in screen)).toBe(false);
    expect(devScreens().some((screen) => "stub" in screen)).toBe(false);

    // 화면의 섹션 구성(Design Lab · 외부 계약 · 옛 링크 · standard 그룹)이
    // 전체를 정확히 한 번씩 덮는지 — 목록에서 사라지는 화면이 없어야 한다.
    const listed = [
      ...designLabScreens(),
      ...devScreens().filter((screen) => screenEntry(screen).kind === "deep-link"),
      ...devScreens().filter((screen) => screenEntry(screen).kind === "legacy-link"),
      ...DEV_SCREEN_GROUPS.flatMap((group) =>
        group.screens.filter((screen) => screenEntry(screen).kind === "standard"),
      ),
    ];
    expect(listed).toHaveLength(counts.total);
    expect(new Set(listed.map((screen) => screen.file)).size).toBe(counts.total);
  });

  it("외부 진입 3개의 sample·인증 계약과 역할을 고정한다", () => {
    const byFile = Object.fromEntries(devScreens().map((screen) => [screen.file, screen]));
    expect({
      community: {
        href: byFile["community/join/[token]"]?.href,
        sample: byFile["community/join/[token]"]?.sample === true,
        auth: byFile["community/join/[token]"]?.auth === true,
        dev: byFile["community/join/[token]"]?.dev === true,
      },
      peer: {
        href: byFile["peer/[token]"]?.href,
        sample: byFile["peer/[token]"]?.sample === true,
        auth: byFile["peer/[token]"]?.auth === true,
        dev: byFile["peer/[token]"]?.dev === true,
      },
      oauth: {
        href: byFile["(auth)/oauth-callback"]?.href,
        sample: byFile["(auth)/oauth-callback"]?.sample === true,
        auth: byFile["(auth)/oauth-callback"]?.auth === true,
        dev: byFile["(auth)/oauth-callback"]?.dev === true,
      },
    }).toEqual({
      community: { href: "/community/join/sample", sample: true, auth: true, dev: false },
      peer: { href: "/peer/sample", sample: true, auth: false, dev: false },
      oauth: { href: "/oauth-callback", sample: false, auth: false, dev: false },
    });
    expect([
      byFile["community/join/[token]"],
      byFile["peer/[token]"],
      byFile["(auth)/oauth-callback"],
    ].every((screen) => screen !== undefined && !canOpenFromDevRegistry(screen))).toBe(true);
  });

  it("Design Lab 네 화면만 collection 에 속하고 모두 DevOnlyRoute 뒤에 있다", () => {
    const labs = designLabScreens();
    expect(labs.map((screen) => screen.file)).toEqual([
      "canon",
      "deepspace-hub",
      "deepspace-preview",
      "deepspace-flowmap",
    ]);
    for (const screen of labs) {
      expect(screen.dev).toBe(true);
      const file = `${screen.file}.tsx`;
      const routeSource = defaultRouteFunctionSource(readFileSync(join(APP, file), "utf8"), file);
      expect(jsxTagNames(routeSource, file)).toContain("DevOnlyRoute");
      expect(canOpenFromDevRegistry(screen)).toBe(true);
    }
  });

  // ── 렌더 축 ────────────────────────────────────────────────────────────

  it("특수 렌더는 항상 redirect 3 · UI 모드 분기 5 와 정확히 일치하고 전부 메모가 있다", () => {
    const special = Object.fromEntries(
      devScreens()
        .filter((screen) => screenRender(screen).kind !== "screen")
        .map((screen) => [screen.file, screenRender(screen)]),
    );
    expect(special).toEqual(EXPECTED_SPECIAL_RENDER);
    for (const file of Object.keys(EXPECTED_SPECIAL_RENDER)) {
      expect(devScreens().find((screen) => screen.file === file)?.note?.trim().length).toBeGreaterThan(0);
    }
    const counts = entryRoleCounts();
    expect({ alwaysRedirect: counts.alwaysRedirect, modeSplit: counts.modeSplit }).toEqual({
      alwaysRedirect: 3,
      modeSplit: 5,
    });
  });

  it("항상 redirect 인 3개는 실제로 Redirect 만 렌더하고 선언한 목적지와 일치한다", () => {
    for (const [routeFile, render] of Object.entries(EXPECTED_SPECIAL_RENDER)) {
      if (render.kind !== "redirect") continue;
      const file = `${routeFile}.tsx`;
      const fullSource = readFileSync(join(APP, file), "utf8");
      const source = defaultRouteFunctionSource(fullSource, file);
      expect({ file, destinations: redirectDestinations(source, file) }).toEqual({
        file,
        destinations: [render.to],
      });
      expect({ file, tags: jsxTagNames(source, file) }).toEqual({ file, tags: ["Redirect"] });
      expect({ file, modules: moduleSpecifiers(fullSource, file) }).toEqual({
        file,
        modules: ["expo-router"],
      });
      // 목적지가 등록된 라우트여야 넘어간 뒤에도 이 목록이 그 화면을 안다.
      expect(destinationScreen(render.to).length).toBeGreaterThan(0);
      const screen = devScreens().find((s) => s.file === routeFile);
      expect(screen && canOpenFromDevRegistry(screen)).toBe(true);
    }
  });

  it("redirect destination 의 외부 URL·경로 탈출·없는 route 를 거부한다", () => {
    expect(() => destinationScreen("https://example.test/secondb")).toThrow();
    expect(() => destinationScreen("/../secondb")).toThrow();
    expect(() => destinationScreen("/does-not-exist")).toThrow();
  });

  it("UI 모드 분기 5개의 선언이 라우트 소스의 실제 분기와 일치한다", () => {
    for (const [routeFile, render] of Object.entries(EXPECTED_SPECIAL_RENDER)) {
      if (render.kind !== "ui-mode-split") continue;
      const file = `${routeFile}.tsx`;
      const source = readFileSync(join(APP, file), "utf8");
      // 분기를 선언했으면 파일에 스킨 분기가 실제로 있어야 한다.
      expect({ file, split: source.includes("isDeepSpaceUI()") }).toEqual({ file, split: true });
      for (const mode of [render.deepspace, render.legacy]) {
        if (mode.kind === "redirect") {
          const quoted = source.includes(`href="${mode.to}"`) || source.includes(`pathname: "${mode.to}"`);
          expect({ file, to: mode.to, declared: quoted }).toEqual({ file, to: mode.to, declared: true });
          expect(destinationScreen(mode.to).length).toBeGreaterThan(0);
        }
        if (mode.kind === "dev-gated-screen") {
          expect({ file, devGate: source.includes("__DEV__") }).toEqual({ file, devGate: true });
          const quoted =
            source.includes(`href="${mode.productionRedirect}"`) ||
            source.includes(`pathname: "${mode.productionRedirect}"`);
          expect({ file, to: mode.productionRedirect, declared: quoted }).toEqual({
            file,
            to: mode.productionRedirect,
            declared: true,
          });
          expect(destinationScreen(mode.productionRedirect).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("09-01 감사가 남긴 메모(#1547)가 보존된다", () => {
    const byFile = Object.fromEntries(devScreens().map((screen) => [screen.file, screen]));
    // /imagine 은 고아가 아니다 — 진입점 실측 기록.
    expect(byFile["imagine"]?.note).toContain("/ops");
    expect(byFile["imagine"]?.note).toContain("/growth");
    // /discover 는 stub 이 아니다 — 프로덕션 실화면과 진입점 기록.
    expect(byFile["discover"]?.note).toContain("/insights 카드");
    // /deepspace-home 은 옛 별 모델 스냅샷 — 현행 홈 검증 대용 금지 기록.
    expect(byFile["deepspace-home"]?.note).toContain("일곱 한 벌");
  });

  // ── /dev-screens 화면 자체 ─────────────────────────────────────────────

  it("개발자 목록이 역할 집계·가상화 목록·PIXEL-CLAY 프리미티브를 사용한다", () => {
    const source = readFileSync(join(APP, "dev-screens.tsx"), "utf8");
    expect(source).toContain("entryRoleCounts(");
    expect(source).toContain("designLabScreens(");
    expect(source).toContain("canOpenFromDevRegistry(");
    expect(source).toContain("screenRender(");
    expect(source).toContain("<SectionList");
    expect(source).toContain("stickySectionHeadersEnabled={false}");
    expect(source).toContain("const topHeadroom = insets.top + m3.minTouch + m3.spacing.s6");
    expect(source).toContain("<View style={[styles.root, { paddingTop: topHeadroom }]}");
    expect(source).toContain("style={styles.list}");
    // 아래쪽 safe-area — 고정 여백으로 되돌아가면 gesture bar 가 마지막 행을 가린다.
    expect(source).toContain("const bottomHeadroom = insets.bottom + m3.spacing.s8");
    expect(source).toContain("contentContainerStyle={[styles.content, { paddingBottom: bottomHeadroom }]}");
    expect(source).toContain("list: { flex: 1 }");
    expect(source).toContain("이 목록에서는 열 수 없습니다");
    for (const primitive of ["PixelSurface", "PixelGlyph"]) {
      expect(source).toContain(primitive);
    }
    expect(source).not.toContain("<ScrollView");
    expect(source).not.toContain("orphanScreens");
  });

  it("외부 계약의 정적 ScreenRow 분기는 press 나 navigation 을 렌더하지 않는다", () => {
    const file = "dev-screens.tsx";
    const source = readFileSync(join(APP, file), "utf8");
    const blockedBranch = firstIfStatementSource(source, file, "ScreenRow");
    expect(blockedBranch).toContain("canOpenFromDevRegistry");
    expect(blockedBranch).not.toContain("onPress");
    expect(blockedBranch).not.toContain("router.push");
    expect(jsxTagNames(blockedBranch, file)).not.toContain("Pressable");
    expect(jsxTagNames(blockedBranch, file)).not.toContain("PressRow");
  });
});

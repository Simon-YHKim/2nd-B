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
import { dirname, join } from "node:path";
import * as ts from "typescript";

import {
  DEV_SCREEN_GROUPS,
  canOpenFromDevRegistry,
  designLabScreens,
  devScreenVariants,
  devScreens,
  entryRoleCounts,
  hrefPathname,
  openableVariants,
  screenEntry,
  screenRender,
  screenVariants,
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
 * 등록된 QA 변형 전부 — 소유 파일과 href, **순서까지** 고정한다.
 *
 * 여기 없는 변형이 생기거나 여기 있는 변형이 사라지면 실패한다. 변형은
 * "라우트 소스가 그 값을 실제로 읽는가" 하나로만 자격이 생기므로, 목록이
 * 늘어날 때 그 근거를 반드시 아래 소스 대조 테스트와 함께 넣어야 한다.
 */
const EXPECTED_QA_VARIANTS: Record<string, string[]> = {
  capture: ["/capture?entry=firstRun"],
  "capture-full": [
    "/capture-full?mode=journal",
    "/capture-full?mode=memo",
    "/capture-full?mode=linkclip",
    "/capture-full?mode=ocr",
    "/capture-full?mode=file",
    "/capture-full?mode=voice",
    "/capture-full?mode=todo",
    "/capture-full?mode=fourw",
  ],
  formats: ["/formats?view=export"],
  secondb: [
    "/secondb?panel=dashboard",
    "/secondb?mode=divergent",
    "/secondb?fromNode=%EC%BB%A4%EB%A6%AC%EC%96%B4",
  ],
  audit: ["/audit?screener=1"],
};

/**
 * 등록하면 안 되는 값들. 공통점은 **에러 없이 무시된다**는 것이다 — 예외도
 * 빈 화면도 안 나고 기본 화면이 그냥 열린다. 그래서 검수자는 "이 변형이 원래
 * 이렇게 생겼구나" 하고 넘어간다. 조용한 거짓말이 이 목록의 유일한 실패 모드다.
 *
 * link · photo 가 특히 위험한 이유: 화면에 보이는 한국어 이름이 linkclip 은
 * "링크", ocr 은 "사진" 이라(locales/ko/capture.json) 라벨을 그대로 옮겨 적으면
 * 정확히 이 두 값이 나온다.
 */
const FORBIDDEN_VARIANT_HREFS = [
  "/capture?mode=link",
  "/capture?mode=photo",
  "/capture-full?mode=link",
  "/capture-full?mode=photo",
  // 무동작 별칭 — 눌러도 기본과 같은 화면이 열린다 (formats.tsx 의 주석이 그렇게 적고 있다).
  "/formats?view=manager",
];

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

const SIGN_IN_REDIRECT = /<Redirect href="\/sign-in" \/>/;

/** import 한 모듈 경로를 실제 파일로. 상대 경로와 `@/` 별칭만 따라간다. */
function resolveLocalModule(specifier: string, fromDir: string): string | null {
  let base: string;
  if (specifier.startsWith(".")) base = join(fromDir, specifier);
  else if (specifier.startsWith("@/")) base = join(process.cwd(), "src", specifier.slice(2));
  else return null; // node_modules 는 앱 라우트의 인증 경계를 갖지 않는다
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** `import { A, B } from "x"` → { specifier: "x", names: ["A","B"] }. */
function importBindings(source: string, file: string): { specifier: string; names: string[] }[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { specifier: string; names: string[] }[] = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    // `import type` 은 런타임에 지워지므로 아무것도 렌더하지 않는다.
    if (statement.importClause?.isTypeOnly) continue;
    const names: string[] = [];
    const clause = statement.importClause;
    if (clause?.name) names.push(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) names.push(element.name.text);
      }
    }
    if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
    out.push({ specifier: statement.moduleSpecifier.text, names });
  }
  return out;
}

/** 파일 안에서 이름(또는 default)으로 컴포넌트 선언의 소스를 찾는다. */
function declarationSource(parsed: ts.SourceFile, name: string | null): string | null {
  for (const statement of parsed.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const isDefault = (statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (name === null ? isDefault : statement.name?.text === name) return statement.getText(parsed);
    }
    if (name !== null && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          return statement.getText(parsed);
        }
      }
    }
  }
  return null;
}


/**
 * 인증 경계를 **다른 컴포넌트에 위임한** 라우트의 계약표.
 *
 * 기본 규칙은 그대로다 — 라우트 파일에 `<Redirect href="/sign-in" />` 리터럴이
 * 있으면 그것으로 끝. 리터럴이 없는데 로그인이 필요한 라우트만 여기 적고,
 * 적은 **그 체인(import → 렌더 → 가드)을 AST 로 대조한다**(`verifyAuthDelegate`).
 * 그래서 이 표는 "예외 목록"이 아니라 근거를 함께 박아 둔 계약이다.
 *
 * ⚠ 범위를 정확히 해 둔다. 이 표가 증명하는 것은 **적어 둔 세 체인이 소스와
 * 일치한다**는 것뿐이다. 라우트의 canonical 렌더 전체를 해석하지 않는다.
 *
 * 일반 JSX 순회로 자동 판정하지 **않는 이유**는 반례가 있어서다 — `/persona` 의
 * 기본(딥스페이스)은 `/core-brain` 으로 넘어가 `PersonaLegacy` 를 그리지 않는데,
 * 순회는 그 안의 sign-in 가드를 근거로 집어 온다. 배지 결과가 우연히 맞아도
 * 근거가 틀리면 다음 사람이 그 틀린 근거를 믿는다. 그래서 순회기는 두지 않는다.
 *
 * 직접 리터럴 판정에 남은 한계(리다이렉트 목적지·barrel·default export 형태)는
 * 이 PR 의 범위가 아니다. 여기서 일반화하지 말 것.
 */
interface AuthDelegate {
  /** 라우트의 default export 가 실제로 렌더하는 컴포넌트. */
  renders: string;
  /** 그 컴포넌트를 가져오는 모듈 (import specifier 그대로). */
  from: string;
  /** 그 모듈에서 sign-in 가드를 **실제로** 가진 선언. renders 와 같을 수 있다. */
  guard: string;
}

const AUTH_DELEGATES: Record<string, AuthDelegate> = {
  "capture-full": { renders: "CaptureLegacy", from: "./capture", guard: "CaptureLegacySession" },
  srs: {
    renders: "DeepSpaceSrsScreen",
    from: "@/screens/deepspace/DeepSpaceDesignScreens",
    guard: "DeepSpaceSrsScreen",
  },
  trends: {
    renders: "TrendsScreen",
    from: "@/screens/deepspace/trends/TrendsScreen",
    guard: "TrendsScreen",
  },
};

function sourceFileOf(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** 위임 계약 한 줄을 소스로 증명한다. 한 고리라도 끊기면 실패한다. */
function verifyAuthDelegate(routeFile: string, delegate: AuthDelegate): void {
  const file = `${routeFile}.tsx`;
  const routePath = join(APP, file);
  const source = readFileSync(routePath, "utf8");

  // ① 위임이려면 라우트 파일 자체에는 가드 리터럴이 없어야 한다.
  expect({ file, direct: SIGN_IN_REDIRECT.test(source) }).toEqual({ file, direct: false });

  // ② default export 가 그 컴포넌트를 실제로 렌더한다.
  const parsed = sourceFileOf(source, file);
  const defaultDeclaration = declarationSource(parsed, null);
  expect(defaultDeclaration).not.toBeNull();
  expect(jsxTagNames(defaultDeclaration ?? "", file)).toContain(delegate.renders);

  // ③ 그 이름이 계약이 말하는 모듈에서 온다.
  const binding = importBindings(source, file).find((b) => b.names.includes(delegate.renders));
  expect({ file, from: binding?.specifier }).toEqual({ file, from: delegate.from });
  const targetPath = resolveLocalModule(delegate.from, dirname(routePath));
  expect(targetPath).not.toBeNull();

  // ④ 가드 선언이 sign-in 리다이렉트를 **자기 본문에** 가진다.
  const targetSource = readFileSync(targetPath ?? "", "utf8");
  const targetParsed = sourceFileOf(targetSource, targetPath ?? "");
  const guardDeclaration = declarationSource(targetParsed, delegate.guard);
  expect({ guard: delegate.guard, found: guardDeclaration !== null }).toEqual({
    guard: delegate.guard,
    found: true,
  });
  expect({ guard: delegate.guard, gated: SIGN_IN_REDIRECT.test(guardDeclaration ?? "") }).toEqual({
    guard: delegate.guard,
    gated: true,
  });

  // ⑤ 렌더하는 것과 가드를 가진 것이 다르면, 그 사이 고리도 실재해야 한다.
  if (delegate.guard !== delegate.renders) {
    const rendersDeclaration = declarationSource(targetParsed, delegate.renders);
    expect(rendersDeclaration).not.toBeNull();
    expect(jsxTagNames(rendersDeclaration ?? "", targetPath ?? "")).toContain(delegate.guard);
  }
}

/** 이 라우트가 로그인 게이트 뒤에 있는가 — 파일 리터럴이거나 증명된 위임이거나. */
function routeRequiresAuth(routeFile: string): boolean {
  const source = readFileSync(join(APP, `${routeFile}.tsx`), "utf8");
  return SIGN_IN_REDIRECT.test(source) || Object.hasOwn(AUTH_DELEGATES, routeFile);
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

  it("클리퍼 형식 관리 항목은 맨 라우트를 열고 내보내기 변형을 안내한다", () => {
    expect(devScreens().find((screen) => screen.file === "formats")).toEqual(
      expect.objectContaining({
        note: expect.stringContaining("?view=export"),
        href: "/formats",
        label: "클리퍼 형식 관리",
      }),
    );
  });

  it("formats 라우트의 파라미터 없는 기본이 실제로 관리 화면이다", () => {
    // 대장의 label 과 라우트의 기본 분기가 어긋나면 개발자 목록이 거짓말을 한다.
    // #1597 은 그 어긋남을 href 에 쿼리를 박아 우회했고, 2026-09-04 에 기본 분기를
    // 뒤집어 원인을 없앴다. 되돌아가면 여기서 잡는다 — 선언이 아니라 소스를 읽는다.
    const body = defaultRouteFunctionSource(readFileSync(join(APP, "formats.tsx"), "utf8"), "formats.tsx");
    expect(body).toContain('view === "export"');
    // 마지막 폴백이 관리 화면이어야 한다. 딥스페이스 기본이 내보내기로 돌아가면 실패.
    expect(body).not.toMatch(/if\s*\(isDeepSpaceUI\(\)\)\s*return\s*<DeepSpaceFormatsScreen/);
    expect(body).toContain("return <FormatsLegacy />;");
  });

  it("과거의 나 항목은 같은 파일의 Life Audit 변형을 안내한다", () => {
    expect(devScreens().find((screen) => screen.file === "audit")).toEqual(
      expect.objectContaining({
        href: "/audit",
        note: expect.stringContaining("/audit?screener=1"),
      }),
    );
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

  it("auth 표시가 실제 로그인 리다이렉트와 일치한다 (위임 계약 포함)", () => {
    // 판정은 둘 중 하나로만 참이 된다 — 라우트 파일의 가드 리터럴이거나,
    // AUTH_DELEGATES 에 적히고 아래 테스트가 체인을 증명한 위임이거나.
    for (const s of devScreens()) {
      expect({ file: s.file, auth: s.auth === true }).toEqual({
        file: s.file,
        auth: routeRequiresAuth(s.file),
      });
    }
  });

  it("위임 계약 3건의 import→렌더→가드 체인이 소스와 일치한다", () => {
    // 표만 적고 넘어가면 그냥 예외 하드코딩이다. 적어 둔 체인을 AST 로 대조한다 —
    // 한 고리라도 끊기면 여기서 실패한다. (라우트의 canonical 렌더 전체를
    // 해석한다는 주장은 아니다 — 이 세 체인만 본다.)
    //
    // 키가 정확히 셋이어야 한다. 늘리려면 근거 체인을 함께 넣어야 하고,
    // 줄이면 해당 화면이 로그인 배지를 잃는다.
    expect(Object.keys(AUTH_DELEGATES).sort()).toEqual(["capture-full", "srs", "trends"]);
    for (const [routeFile, delegate] of Object.entries(AUTH_DELEGATES)) {
      verifyAuthDelegate(routeFile, delegate);
      expect({ file: routeFile, auth: devScreens().find((s) => s.file === routeFile)?.auth }).toEqual({
        file: routeFile,
        auth: true,
      });
    }
  });

  it("일반 JSX 순회기를 두지 않는다 (/persona 반례 기록)", () => {
    // 왜 순회기가 없는지를 남긴다. /persona 의 기본(딥스페이스)은 /core-brain 으로
    // 넘어가 PersonaLegacy 를 **그리지 않는데**, PersonaLegacy 안에 sign-in 가드가
    // 있어서 순회는 그것을 근거로 집어 온다 — 배지는 우연히 맞고 근거는 틀린다.
    // 그래서 순회기를 만들지 않았고, persona 는 위임 계약에도 넣지 않는다.
    // (여기서 그 한계를 고치려 들지 말 것 — 별도 PR 사안이다.)
    expect(Object.hasOwn(AUTH_DELEGATES, "persona")).toBe(false);

    const file = "persona.tsx";
    const source = readFileSync(join(APP, file), "utf8");
    const defaultDeclaration = declarationSource(sourceFileOf(source, file), null) ?? "";
    // 기본 가지는 /core-brain 리다이렉트다 (딥스페이스가 기본 빌드).
    expect(defaultDeclaration).toContain("isDeepSpaceUI()");
    expect(redirectDestinations(defaultDeclaration, file)).toContain("/core-brain");
    // persona 의 auth 는 파일 자체의 가드 리터럴로 정당화된다 — 체인 추적 결과가 아니다.
    expect(SIGN_IN_REDIRECT.test(source)).toBe(true);
    expect(routeRequiresAuth("persona")).toBe(true);

    // 순회기가 되살아나면 이 반례가 다시 틀린 근거가 된다. 이름으로 막아 둔다.
    // 호출·정의 형태(`이름(`)만 본다 — 바로 위 금지 목록의 문자열 자체는 아니다.
    const self = readFileSync(__filename, "utf8");
    for (const banned of ["componentRendersSignIn", "rendersSignInRedirect"]) {
      expect({ banned, called: self.includes(`${banned}(`) }).toEqual({ banned, called: false });
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

  it("개인정보 처리 기록은 전용 route와 읽기·프로필 계약을 가진다", () => {
    const screen = devScreens().find((entry) => entry.file === "processing-log");
    expect(screen).toEqual(expect.objectContaining({ href: "/processing-log", auth: true }));

    const privacySource = readFileSync(
      join(process.cwd(), "src", "screens", "deepspace", "DeepSpaceDesignScreens.tsx"),
      "utf8",
    );
    const processingAction = privacySource.match(
      /<Action label=\{t\("privacy\.processingLog"\)\}[\s\S]*?\/>/,
    )?.[0] ?? "";
    expect(processingAction).toContain('router.push("/processing-log")');
    expect(processingAction).not.toContain('router.push("/audit")');

    const routeSource = readFileSync(join(APP, "processing-log.tsx"), "utf8");
    const routeBody = defaultRouteFunctionSource(routeSource, "processing-log.tsx");
    expect(routeBody).toContain('<Redirect href="/sign-in" />');
    expect(routeBody).toContain('<Redirect href="/complete-profile" />');
    expect(routeBody).toContain("profileProbeFailed");
    expect(routeBody).toContain("hasProfile !== true");
    expect(routeBody).toContain("<FlatList");
    expect(routeBody).toContain("accessibilityLabel={title}");
    expect(routeBody).toContain("removeClippedSubviews={false}");
    expect(routeBody).not.toContain("<ScrollView");
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

  it("flowmap 보관본은 현행 정본을 주장하거나 데모 작업을 시작하지 않는다", () => {
    const flowmap = designLabScreens().find((screen) => screen.file === "deepspace-flowmap");
    expect(flowmap).toMatchObject({
      label: "화면 흐름도",
      entry: { kind: "dev", collection: "design-lab" },
    });
    expect(flowmap?.note).toContain("현재 동선의 정본이 아니며");

    const source = readFileSync(
      join(process.cwd(), "src", "screens", "deepspace", "DeepSpaceFlowMapScreen.tsx"),
      "utf8",
    );
    expect(source).toContain("DESIGN LAB · ARCHIVE");
    expect(source).toContain("Design Lab archive");
    expect(source).toContain("이전 자기이해 축");
    expect(source).not.toMatch(/\bstartTask\s*\(/);
    expect(source).not.toMatch(/\bsetTimeout\s*\(/);
    expect(source).not.toMatch(/7\s*(?:렌즈|lenses|lentes|lensa)/i);
    expect(source).not.toMatch(/(?:canonical|정본|canonico|kanonis)\s+flowmap/i);
    for (const inactiveNotice of [
      "Inactive · starts no task or timer",
      "비활성 · 작업이나 타이머를 시작하지 않음",
      "Inactiva · no inicia tareas ni temporizadores",
      "Inativa · não inicia tarefas nem temporizadores",
      "Nonaktif · tidak memulai tugas atau timer",
    ]) {
      expect(source).toContain(inactiveNotice);
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

  // ── QA 변형 ────────────────────────────────────────────────────────────

  it("QA 변형은 등록된 집합·순서와 정확히 일치한다", () => {
    const actual = Object.fromEntries(
      devScreens()
        .filter((screen) => screenVariants(screen).length > 0)
        .map((screen) => [screen.file, screenVariants(screen).map((variant) => variant.href)]),
    );
    expect(actual).toEqual(EXPECTED_QA_VARIANTS);
    // 라벨이 비어 있으면 버튼에 이름이 없다.
    for (const { variant } of devScreenVariants()) {
      expect(variant.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("변형 href 는 유일하고 라우트 href 와 겹치지 않는다", () => {
    const variantHrefs = devScreenVariants().map(({ variant }) => variant.href);
    expect(new Set(variantHrefs).size).toBe(variantHrefs.length);

    // 파라미터 없는 기본과 같은 href 를 단 변형은 같은 화면을 두 번 여는 버튼이다.
    const routeHrefs = new Set(devScreens().map((screen) => screen.href));
    for (const href of variantHrefs) expect(routeHrefs.has(href)).toBe(false);
  });

  it("변형은 소유 화면과 같은 pathname 을 연다", () => {
    for (const { screen, variant } of devScreenVariants()) {
      // 다른 화면으로 가는 버튼이 소유 화면 밑에 붙으면 목록이 소속을 거짓말한다.
      expect({ file: screen.file, path: hrefPathname(variant.href) }).toEqual({
        file: screen.file,
        path: screen.href,
      });
      // 쿼리가 없으면 그냥 소유 화면이다 — 변형일 이유가 없다.
      expect(variant.href.length).toBeGreaterThan(screen.href.length);
      expect(variant.href.startsWith(`${screen.href}?`)).toBe(true);
      expect(variant.href).not.toContain("[");
      expect(variant.href).not.toContain("(");
    }
  });

  it("변형은 라우트 레코드를 늘리지 않는다", () => {
    // 대장은 라우트 100건이고 변형은 그 안의 여는 방법이다. 변형이 레코드로
    // 새면 `src/app` 대조가 유령 항목으로 실패한다 — 개수 핀이 아니라 파일
    // 목록과의 동치로 지킨다(개수만 세면 하나 지우고 하나 더할 때 통과한다).
    expect(entryRoleCounts().total).toBe(routeFiles().length);
    expect(devScreens()).toHaveLength(routeFiles().length);
    expect(devScreenVariants().length).toBeGreaterThan(0);
    // 세 번째 분류 축이 생기면 두 축 계약이 무너진다.
    for (const screen of devScreens()) {
      expect("classification" in screen).toBe(false);
      expect("orphan" in screen).toBe(false);
      expect("stub" in screen).toBe(false);
    }
  });

  it("capture 계열 변형은 CAPTURE_MODES 의 id 만 쓴다", () => {
    // 선언이 아니라 정본 소스를 읽어 대조한다 — 모드 id 가 draft.ts 에서 바뀌면
    // 여기서 잡힌다. 화면 라벨("링크"·"사진")을 옮겨 적은 값은 통과할 수 없다.
    const draftSource = readFileSync(
      join(process.cwd(), "src", "lib", "capture", "draft.ts"),
      "utf8",
    );
    const declared = draftSource.match(/export const CAPTURE_MODES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const modes = [...declared.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(modes.length).toBeGreaterThan(0);

    const used = devScreenVariants()
      .map(({ variant }) => variant.href.match(/^\/capture-full\?mode=(.+)$/)?.[1])
      .filter((mode): mode is string => typeof mode === "string");
    expect(used).toEqual(EXPECTED_QA_VARIANTS["capture-full"].map((href) => href.split("=")[1]));
    for (const mode of used) expect(modes).toContain(mode);
    // 여덟 모드 전부를 덮는다 — 하나라도 빠지면 그 모드는 앱 안에서 열 수 없다.
    expect([...used].sort()).toEqual([...modes].sort());
  });

  it("조용히 무시되는 파라미터는 등록하지 않는다", () => {
    const hrefs = new Set(devScreenVariants().map(({ variant }) => variant.href));
    for (const forbidden of FORBIDDEN_VARIANT_HREFS) {
      expect({ forbidden, registered: hrefs.has(forbidden) }).toEqual({ forbidden, registered: false });
    }
  });

  it("변형을 선언한 라우트가 실제로 그 파라미터를 읽는다", () => {
    // 읽지 않는 파라미터를 단 버튼은 기본 화면을 열면서 변형인 척한다.
    const read = (file: string) => readFileSync(join(APP, file), "utf8");

    expect(read("audit.tsx")).toContain('if (screener === "1")');
    expect(read("formats.tsx")).toContain('view === "export"');
    expect(read("secondb.tsx")).toContain('params.panel === "dashboard"');
    expect(read("secondb.tsx")).toContain('params.mode === "divergent"');
    expect(read("secondb.tsx")).toContain("params.fromNode");
    expect(read("capture.tsx")).toContain('entry === "firstRun"');

    // /capture-full 은 자기 파일에서 파라미터를 읽지 않는다 — CaptureLegacy 를
    // 재사용하고 그쪽이 현재 라우트의 쿼리를 읽는다. 그 배선이 끊기면 여덟 개
    // 버튼이 전부 조용히 일기 모드를 연다.
    expect(read("capture-full.tsx")).toContain('import { CaptureLegacy } from "./capture"');
    expect(read("capture-full.tsx")).toContain("<CaptureLegacy");
    expect(read("capture.tsx")).toContain("mode: modeParam");
    expect(read("capture.tsx")).toContain("planCaptureParamConsumption({");
    expect(read("capture.tsx")).toContain("switchCaptureMode(plan.targetMode)");
  });

  it("한글이 든 변형 href 는 URL 인코딩돼 있다", () => {
    for (const { variant } of devScreenVariants()) {
      // 날 한글을 href 에 그대로 두면 플랫폼마다 인코딩이 갈린다. URLSearchParams
      // 는 읽는 순간 디코딩하므로 파싱 결과가 아니라 **원문 문자열**을 봐야 한다.
      expect(variant.href).toMatch(/^[\x20-\x7E]*$/);
      const query = variant.href.slice(variant.href.indexOf("?") + 1);
      for (const [, value] of new URLSearchParams(query)) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
    // 인코딩된 값이 실제로 뜻 있는 견본으로 풀린다 — 깨진 바이트가 아니다.
    const node = devScreenVariants().find(({ variant }) => variant.href.includes("fromNode="));
    expect(node?.variant.href).toContain("%EC%BB%A4");
    expect(new URLSearchParams(node?.variant.href.split("?")[1] ?? "").get("fromNode")).toBe("커리어");
  });

  it("등급을 타는 변형만 등급 안내를 달고, 그 근거가 소스에 있다", () => {
    const byHref = Object.fromEntries(
      devScreenVariants().map(({ variant }) => [variant.href, variant]),
    );

    // ?mode=divergent 는 트위비를 심는데 트위비는 pro 전용이다. free·plus 로 열면
    // effect 가 페르소나를 조용히 되돌린다 — 에러도 잠금 표시도 없다. 그래서
    // 이 변형에는 **반드시** 등급 안내가 붙어야 한다.
    const divergent = byHref["/secondb?mode=divergent"];
    expect(divergent?.note).toContain("Brain");
    expect(divergent?.note).toContain("EXPO_PUBLIC_FORCE_TIER=brain");

    // 근거 ①: 화면이 twi 를 심고, 허용되지 않으면 secondb 로 되돌린다.
    const secondb = readFileSync(join(APP, "secondb.tsx"), "utf8");
    expect(secondb).toContain('params.mode === "divergent" ? "twi" : "secondb"');
    expect(secondb).toContain("personaAllowed(effectiveTier, rev2Persona");
    expect(secondb).toContain('selectRev2Persona("secondb")');

    // 근거 ②: twi 는 free·plus 불가, pro 가능 (등급 정본의 고정 픽스처).
    const tierFixtures = readFileSync(
      join(process.cwd(), "src", "lib", "entitlements", "__tests__", "tiers.test.ts"),
      "utf8",
    );
    expect(tierFixtures).toContain("personaAllowed('free', 'twi')).toBe(false)");
    expect(tierFixtures).toContain("personaAllowed('plus', 'twi')).toBe(false)");
    expect(tierFixtures).toContain("personaAllowed('pro', 'twi')).toBe(true)");

    // 근거 ③: 공개 등급 pro 가 곧 DB 등급 brain 이라 안내의 'Brain' 이 맞다.
    const tierMap = readFileSync(
      join(process.cwd(), "src", "lib", "entitlements", "tier-map.ts"),
      "utf8",
    );
    expect(tierMap).toMatch(/pro:\s*'brain'/);

    // 담기 모드는 **등급 이야기가 아니다.** 할당량이 비어 있고 전부 Lv1 인데
    // 등급 안내를 달면 검수자가 없는 페이월을 찾게 된다. 둘을 섞지 않는다.
    const entitlements = readFileSync(
      join(process.cwd(), "src", "lib", "progression", "entitlements.ts"),
      "utf8",
    );
    expect(entitlements).toMatch(/FREE_LIMIT:\s*Partial<Record<GatedFeature,\s*number>>\s*=\s*\{\}/);
    for (const href of EXPECTED_QA_VARIANTS["capture-full"]) {
      expect(byHref[href]?.note ?? "").not.toContain("Brain");
    }
  });

  it("딥링크 계약에는 실행 가능한 변형이 붙지 않는다", () => {
    for (const screen of devScreens()) {
      if (canOpenFromDevRegistry(screen)) {
        expect(openableVariants(screen)).toEqual(screenVariants(screen));
        continue;
      }
      // 계약 화면은 mount 자체가 조회·가입·세션 변경을 시작할 수 있다.
      expect(openableVariants(screen)).toHaveLength(0);
    }
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

  it("개발자 목록이 변형을 소유 행 아래에서 실제로 연다", () => {
    const source = readFileSync(join(APP, "dev-screens.tsx"), "utf8");
    // 계약 판정은 openableVariants 한 곳이 소유한다 — 화면이 따로 판정하면 갈린다.
    expect(source).toContain("openableVariants(screen)");
    expect(source).not.toContain("screenVariants(screen)");
    // 소유 행 바로 아래에 붙는다.
    expect(source).toMatch(/<ScreenRow screen=\{item\} section=\{section\} \/>\s*<VariantList screen=\{item\} \/>/);
    // 탭 표적은 줄이지 않는다. (줄바꿈이 CRLF 일 수 있어 공백은 느슨하게 본다.)
    expect(source).toMatch(/variantContent:\s*\{\s*minHeight:\s*m3\.minTouch,/);
  });

  it("변형 버튼의 접근성·이동이 VariantRow 안에서 성립한다", () => {
    // ⚠ 파일 전체를 grep 하면 옆의 PressRow 가 가진 a11y 속성이 통과시켜 준다
    //    (실제로 이전 판이 그랬다). 그래서 **VariantRow 선언 안만** 본다.
    const file = "dev-screens.tsx";
    const source = readFileSync(join(APP, file), "utf8");
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const row = declarationSource(parsed, "VariantRow");
    expect(row).not.toBeNull();
    const body = row ?? "";

    // 이 버튼이 실제로 그 변형 href 로 이동한다 — 아니면 장식이다.
    expect(body).toContain("router.push(variant.href)");
    expect(body).toContain('accessibilityRole="button"');
    // 스크린리더로는 앞 행이 안 보인다. 라벨에 소유 화면 이름과 변형 이름이 함께 있어야
    // "내보내기 시안" 하나만 읽히고 어느 화면 것인지 모르는 상태가 안 된다.
    expect(body).toMatch(/accessibilityLabel=\{`\$\{screen\.label\}[^`]*\$\{variant\.label\}[^`]*`\}/);
    expect(body).toMatch(/accessibilityHint=\{`\$\{variant\.href\}[^`]*`\}/);
    // 표적 크기는 이 행의 스타일이 소유한다.
    expect(body).toContain("styles.variantContent");
    // PIXEL-CLAY 프리미티브로 그린다 (새 의존성 없음).
    for (const primitive of ["PixelSurface", "PixelGlyph"]) {
      expect(body).toContain(primitive);
    }

    // VariantList 는 계약 게이트를 우회하지 않는다.
    const list = declarationSource(parsed, "VariantList") ?? "";
    expect(list).toContain("openableVariants(screen)");
    expect(list).toContain("key={variant.href}");
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

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

import { DB_TIER_BY_PUBLIC } from "@/lib/entitlements/tier-map";
import { personaAllowed } from "@/lib/entitlements/tiers";
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

function sourceFileOf(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * 인증 경계를 다른 컴포넌트에 **위임한** 라우트 셋. 라우트 파일에 가드 리터럴이
 * 없는데 로그인이 필요한 것은 이 셋뿐이고, 아래 픽스처가 네 선언의 반환 JSX
 * 모양·import 줄·가드를 그대로 못박는다.
 *
 * ⚠ 일반 판정기는 만들지 않는다. JSX 를 훑으면 실행되지 않는 가지까지 근거로
 * 집는다 — `/persona` 는 기본이 `/core-brain` 인데 `PersonaLegacy` 안의 가드를
 * 집어 온다(배지는 맞고 근거는 틀린다). 리터럴 판정의 다른 한계도 범위 밖이다.
 */
const AUTH_DELEGATES = ["capture-full", "srs", "trends"] as const;
const SCREENS = join(process.cwd(), "src", "screens", "deepspace");

/** 위임에 관여하는 네 선언의 반환 모양(과 import 줄). 모양이 바뀌면 실패한다. */
const DELEGATE_FIXTURES: { label: string; path: string; fn: string | null; shapes: string[]; importLine?: string }[] = [
  { label: "capture-full", path: join(APP, "capture-full.tsx"), fn: null,
    shapes: ["DeepSpaceScreen>CaptureLegacy", "CaptureLegacy"],
    importLine: 'import { CaptureLegacy } from "./capture";' },
  { label: "srs", path: join(APP, "srs.tsx"), fn: null, shapes: ["DeepSpaceSrsScreen"],
    importLine: 'import { DeepSpaceSrsScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";' },
  { label: "trends", path: join(APP, "trends.tsx"), fn: null, shapes: ["DevOnlyRoute>TrendsScreen"],
    importLine: 'import { TrendsScreen } from "@/screens/deepspace/trends/TrendsScreen";' },
  { label: "CaptureLegacy", path: join(APP, "capture.tsx"), fn: "CaptureLegacy",
    shapes: ["CaptureLegacySession", "CaptureLegacySession"] },
];

/** 실제로 도달 가능한 `if (!userId) return <Redirect href="/sign-in" />` 를 가진 선언 셋. */
const DELEGATE_GUARDS: { label: string; path: string; fn: string }[] = [
  { label: "CaptureLegacySession", path: join(APP, "capture.tsx"), fn: "CaptureLegacySession" },
  { label: "DeepSpaceSrsScreen", path: join(SCREENS, "DeepSpaceDesignScreens.tsx"), fn: "DeepSpaceSrsScreen" },
  { label: "TrendsScreen", path: join(SCREENS, "trends", "TrendsScreen.tsx"), fn: "TrendsScreen" },
];

/** FunctionDeclaration 노드. 다른 export 형태는 통과가 아니라 실패다. */
function functionDeclarationIn(parsed: ts.SourceFile, name: string | null): ts.FunctionDeclaration {
  for (const s of parsed.statements) {
    if (!ts.isFunctionDeclaration(s)) continue;
    const isDefault = (s.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (name === null ? isDefault : s.name?.text === name) return s;
  }
  throw new Error(`${parsed.fileName}: no FunctionDeclaration for ${name ?? "(default export)"}`);
}

const declarationAt = (path: string, name: string | null) =>
  functionDeclarationIn(sourceFileOf(readFileSync(path, "utf8"), path), name);
const declarationFrom = (source: string, name: string | null) =>
  functionDeclarationIn(sourceFileOf(source, "synthetic.tsx"), name);

function jsxTagOf(node: ts.Node): string | null {
  let e = node;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isJsxElement(e)) return e.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(e)) return e.tagName.getText();
  return null;
}

/**
 * 각 return 을 `"root"` 또는 `"root>child,child"` 로. 중첩 함수 return 은 뺀다.
 *
 * 모양을 통째로 비교하면 별도 판정기 없이 거짓 근거가 걸린다: `false && <X/>`·
 * 삼항은 `(non-jsx)` 가 되고, prop 안의 JSX 는 child 가 아니라 안 들어오며,
 * 도달 불가 return 을 덧붙이면 배열 길이가 달라진다.
 *
 * 마지막 top-level 문이 direct return 이 아니면 `(fallthrough)` 를 붙인다. 위치를
 * 버리면 `if (false) return <T/>;` 가 `["T"]` 로 보여 픽스처를 통과한다.
 */
function returnShapes(fn: ts.FunctionDeclaration): string[] {
  const shapes: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return;
    if (!ts.isReturnStatement(node)) return void ts.forEachChild(node, visit);
    let e: ts.Node | undefined = node.expression;
    while (e && ts.isParenthesizedExpression(e)) e = e.expression;
    const root = e ? jsxTagOf(e) : null;
    if (!e || root === null) return void shapes.push(e ? "(non-jsx)" : "(empty)");
    const kids = ts.isJsxElement(e) ? e.children.map(jsxTagOf).filter((t): t is string => t !== null) : [];
    shapes.push(kids.length > 0 ? `${root}>${kids.join(",")}` : root);
  };
  const body = fn.body?.statements ?? [];
  for (const s of body) visit(s);
  const last = body[body.length - 1];
  if (!last || !ts.isReturnStatement(last)) shapes.push("(fallthrough)");
  return shapes;
}

/**
 * 본문 **직계**에 `if (!userId) return <Redirect href="/sign-in" />;` 가 있는가.
 * 순서대로 읽고 무조건 return/throw 를 먼저 만나면 그 뒤는 도달 불가라 멈춘다.
 * 중첩 if · false 가지 · prop 안의 Redirect 는 인정하지 않는다.
 */
function hasSignInGuard(fn: ts.FunctionDeclaration): boolean {
  for (const s of fn.body?.statements ?? []) {
    if (ts.isReturnStatement(s) || ts.isThrowStatement(s)) return false;
    if (!ts.isIfStatement(s)) continue;
    const c = s.expression;
    if (!ts.isPrefixUnaryExpression(c) || c.operator !== ts.SyntaxKind.ExclamationToken) continue;
    if (!ts.isIdentifier(c.operand) || c.operand.text !== "userId") continue;
    let branch: ts.Statement = s.thenStatement;
    if (ts.isBlock(branch)) {
      if (branch.statements.length !== 1) continue;
      branch = branch.statements[0];
    }
    if (!ts.isReturnStatement(branch) || !branch.expression) continue;
    let r: ts.Node = branch.expression;
    while (ts.isParenthesizedExpression(r)) r = r.expression;
    if (!ts.isJsxSelfClosingElement(r) || r.tagName.getText() !== "Redirect") continue;
    const href = r.attributes.properties.find(
      (pr): pr is ts.JsxAttribute => ts.isJsxAttribute(pr) && pr.name.getText() === "href",
    )?.initializer;
    if (href && ts.isStringLiteral(href) && href.text === "/sign-in") return true;
  }
  return false;
}

/** 로그인 게이트 뒤인가 — 파일 리터럴이거나 위 셋 중 하나이거나. */
function routeRequiresAuth(routeFile: string): boolean {
  const source = readFileSync(join(APP, `${routeFile}.tsx`), "utf8");
  return SIGN_IN_REDIRECT.test(source) || (AUTH_DELEGATES as readonly string[]).includes(routeFile);
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

  it("위임 게이트 3건의 렌더 모양·import·가드를 고정한다", () => {
    // 판정기를 일반화하지 않고 네 선언의 모양을 그대로 못박는다. 모양이 조금이라도
    // 달라지면(가지 추가·prop 으로 밀어넣기·도달 불가 return) 배열이 어긋나 실패한다.
    for (const f of DELEGATE_FIXTURES) {
      expect({ label: f.label, shapes: returnShapes(declarationAt(f.path, f.fn)) }).toEqual({ label: f.label, shapes: f.shapes });
      if (f.importLine) expect(readFileSync(f.path, "utf8")).toContain(f.importLine);
    }
    // 위임이려면 라우트 파일 자체에는 가드 리터럴이 없어야 한다.
    for (const routeFile of AUTH_DELEGATES) {
      const direct = SIGN_IN_REDIRECT.test(readFileSync(join(APP, `${routeFile}.tsx`), "utf8"));
      const auth = devScreens().find((s) => s.file === routeFile)?.auth;
      expect({ routeFile, direct, auth }).toEqual({ routeFile, direct: false, auth: true });
    }
    // 가드를 가진 세 선언이 실제로 도달 가능한 !userId 가드를 가진다.
    for (const g of DELEGATE_GUARDS) {
      expect({ label: g.label, gated: hasSignInGuard(declarationAt(g.path, g.fn)) }).toEqual({ label: g.label, gated: true });
    }
  });

  it("모양·가드 판정이 false&& · prop · 도달 불가를 거른다", () => {
    const shapes = (src: string) => returnShapes(declarationFrom(src, null));
    expect(shapes("export default function R(){ return <S><T/></S>; }")).toEqual(["S>T"]);
    expect(shapes("export default function R(){ return false && <T/>; }")).toEqual(["(non-jsx)"]);
    expect(shapes("export default function R(){ return <S slot={<T/>}/>; }")).toEqual(["S"]);
    expect(shapes("export default function R(){ return <O/>; return <T/>; }")).toEqual(["O", "T"]);
    expect(shapes("export default function R(){ if (false) return <T/>; }")).toEqual(["T", "(fallthrough)"]);

    const guard = (src: string) => hasSignInGuard(declarationFrom(src, "G"));
    expect(guard('function G(){ if (!userId) return <Redirect href="/sign-in" />; return <X/>; }')).toBe(true);
    expect(guard('function G(){ return <X/>; if (!userId) return <Redirect href="/sign-in" />; }')).toBe(false);
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

  it("등급을 타는 변형만 등급 안내를 달고, 그 근거가 실행으로 확인된다", () => {
    // ?mode=divergent 는 트위비를 심는데 트위비는 pro(=brain) 전용이라 free·plus 에서는
    // effect 가 페르소나를 **조용히** 되돌린다. 그래서 이 변형에만 등급 안내가 붙는다.
    const note = devScreenVariants().find(({ variant }) => variant.href === "/secondb?mode=divergent")?.variant.note ?? "";
    expect(note).toContain("Brain");
    expect(note).toContain("EXPO_PUBLIC_FORCE_TIER=brain");

    const secondb = readFileSync(join(APP, "secondb.tsx"), "utf8");
    expect(secondb).toContain('params.mode === "divergent" ? "twi" : "secondb"');
    expect(secondb).toContain('selectRev2Persona("secondb")');

    // 등급 정본을 문자열이 아니라 **실행**으로 확인한다.
    expect([personaAllowed("free", "twi"), personaAllowed("plus", "twi"), personaAllowed("pro", "twi")]).toEqual([false, false, true]);
    expect(DB_TIER_BY_PUBLIC.pro).toBe("brain");
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

  it("변형 버튼의 접근성·이동이 VariantRow 선언 안에서 성립한다", () => {
    // ⚠ 파일 전체를 grep 하면 옆 PressRow 의 a11y 속성이 통과시켜 준다(이전 판이 그랬다).
    //    그래서 VariantRow 선언 안만 본다.
    const row = declarationAt(join(APP, "dev-screens.tsx"), "VariantRow").getText();
    expect(row).toContain("router.push(variant.href)");
    expect(row).toContain('accessibilityRole="button"');
    // 스크린리더로는 앞 행이 안 보인다 — 라벨에 소유 화면 이름이 함께 있어야 한다.
    expect(row).toMatch(/accessibilityLabel=\{`\$\{screen\.label\}[^`]*\$\{variant\.label\}[^`]*`\}/);
    expect(row).toMatch(/accessibilityHint=\{`\$\{variant\.href\}[^`]*`\}/);
    expect(row).toContain("styles.variantContent");
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

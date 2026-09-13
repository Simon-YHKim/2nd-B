// 미성년 잠금은 연령을 모를 때도 잠근다 (vibe r260914 R3-A 인가 게이트 발견).
//
// AuthContext.isMinor 는 세 값이다: true(확인된 미성년) · false(확인된 성인) · null(모름 -
// 로딩 중, 프로필 없음, 프로브 실패). 배송 화면의 잠금 몇 곳이 `isMinor === true` 만 막아서
// null 이 성인 쪽으로 샜다. 인가 게이트가 실제 핸들러를 뽑아 돌려 보였다: 첫 프로브가 실패한
// 등록 14~17세 계정(isMinor=null)이 가져오기 허브에서 SMS 를 파싱하고 captureFromMarkdown
// 까지 갔다(확인된 미성년 writeCalls 0, null writeCalls 1). 그 대조 실험을 여기로 옮겼다.
//
// 고친 규칙: 잠금은 `isMinor !== false` 로 건다. 확인된 성인(false)만 연다 - 성인 흐름은 그대로다.
// 로딩 중 깜빡임은 잠금 문구가 아니라 로딩 상태가 맡는다(화면마다 로딩 갈래가 잠금보다 앞이다).
//
// 탐색 범위와 잠그지 않은 자리(안전 분류 · 핫라인 인자 등)의 목록은 PR #1811 본문
// "게이트 발견 대응" 절에 있다. 컴포넌트 렌더 테스트가 막혀 있어(RN 0.85 upstream) 핸들러와
// 식은 소스에서 뽑아 실행한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vm from "node:vm";
import * as ts from "typescript";

import { detectImportKind } from "../../lib/import/detect";
import { buildProposals, proposalsToMarkdown } from "../../lib/import/proposals";

const ROOT = process.cwd();
const AGES: readonly (boolean | null)[] = [true, null, false];

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function find<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const out: T[] = [];
  const visit = (node: ts.Node): void => {
    if (predicate(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

function declaration(sf: ts.SourceFile, name: string): ts.VariableDeclaration {
  const matches = find(sf, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(sf) === name);
  if (matches.length !== 1 || !matches[0].initializer) throw new Error(`${sf.fileName}: expected one \`${name}\` with an initializer`);
  return matches[0];
}

function toJs(code: string): string {
  return ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
}

/** 소스 식 하나를 주어진 이름들로 실행한다. */
function evaluate(expression: string, scope: Record<string, unknown>): unknown {
  return vm.runInNewContext(toJs(`(${expression})`), scope);
}

describe("가져오기 허브 - 통신 · 위치 잠금은 모름도 막는다", () => {
  const sf = parse("src/screens/deepspace/import/ImportHubScreen.tsx");
  const SMS_EXPORT =
    '<smses><sms address="test-contact" date="1704430920000" type="1" body="meeting tomorrow at 3pm" /></smses>';

  type Write = { rawMd: string; kindOverride?: string };
  type Tile = { key: string; kind: string; minorLocked: boolean; nameEn: string };
  type Outcome = { proposals: { id: string }[] };

  /** 화면 상태를 들고 실제 openSource · runAnalyze · ratify 를 돌리는 판. 저장은 첫 진입에서 멈춘다. */
  function hub(isMinor: boolean | null) {
    const writes: Write[] = [];
    const s: Record<string, unknown> = {
      isMinor,
      userId: "synthetic-user",
      ko: false,
      busy: false,
      active: null,
      outcome: null,
      outcomeKind: null,
      selected: new Set<string>(),
      step: "hub",
      errored: false,
      importErr: false,
      progression: { tier: "free" },
      detectImportKind,
      buildProposals,
      proposalsToMarkdown,
      name: (tile: Tile) => tile.nameEn,
      t: (key: string) => key,
      captureFromMarkdown: async (input: Write) => {
        writes.push(input);
        throw new Error("STOP_AT_WRITE_SPY");
      },
      captureEvent: () => undefined,
      proposalDecided: () => ({}),
      console: { warn: () => undefined, error: () => undefined, log: () => undefined },
      Set,
      Date,
    };
    for (const setter of ["Active", "Paste", "Outcome", "OutcomeKind", "Errored", "GErr", "Step", "Selected", "Busy", "LedgerWarn", "ImportErr"]) {
      const key = setter.charAt(0).toLowerCase() + setter.slice(1);
      s[`set${setter}`] = (value: unknown) => {
        s[key] = value;
      };
    }
    vm.createContext(s);
    for (const name of ["SOURCES", "MINOR_LOCKED_KINDS", "openSource", "runAnalyze", "ratify"]) {
      vm.runInContext(toJs(`var ${name} = ${declaration(sf, name).initializer!.getText(sf)};`), s);
    }
    const tile = (key: string): Tile => {
      const found = (s.SOURCES as Tile[]).find((candidate) => candidate.key === key);
      if (!found) throw new Error(`no import tile ${key}`);
      return found;
    };
    const call = (handler: string, ...args: unknown[]) => (s[handler] as (...a: unknown[]) => unknown)(...args);
    const ratifyAll = async () => {
      const outcome = s.outcome as Outcome | null;
      if (outcome) s.selected = new Set(outcome.proposals.map((p) => p.id));
      await call("ratify");
    };
    return { s, writes, tile, call, ratifyAll };
  }

  test("대조군: 성인(false)은 SMS 타일이 열리고 파싱돼 저장까지 간다", async () => {
    const h = hub(false);
    h.call("openSource", h.tile("sms"));
    expect(h.s.active).not.toBeNull();
    h.call("runAnalyze", SMS_EXPORT, "fixture.xml");
    expect((h.s.outcome as Outcome).proposals.length).toBeGreaterThan(0);
    await h.ratifyAll();
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].kindOverride).toBe("self_knowledge");
    expect(h.writes[0].rawMd).toContain("meeting tomorrow");
  });

  test.each([true, null])("isMinor=%s: SMS 타일이 안 열리고 저장 호출은 0이다", async (isMinor) => {
    const h = hub(isMinor);
    h.call("openSource", h.tile("sms"));
    expect(h.s.active).toBeNull();
    expect(h.s.step).toBe("hub");
    h.call("runAnalyze", SMS_EXPORT, "fixture.xml");
    await h.ratifyAll();
    expect(h.writes).toHaveLength(0);
  });

  test.each([true, null])("isMinor=%s: 잠기지 않은 타일로 SMS 파일을 넣어도(내용 판별) 파싱되지 않는다", async (isMinor) => {
    const h = hub(isMinor);
    h.call("openSource", h.tile("notion"));
    expect(h.s.active).not.toBeNull();
    h.call("runAnalyze", SMS_EXPORT, "fixture.xml");
    expect(h.s.errored).toBe(true);
    expect(h.s.outcome).toBeNull();
    await h.ratifyAll();
    expect(h.writes).toHaveLength(0);
  });

  test("저장 직전에도 다시 본다: 분석 뒤 연령이 모름이 되면 통신 가져오기를 저장하지 않는다", async () => {
    for (const key of ["sms", "notion"]) {
      // notion 타일은 잠기지 않았지만 내용이 SMS 로 판별된다 - 저장 때는 판별된 종류를 본다.
      const h = hub(false);
      h.call("openSource", h.tile(key));
      h.call("runAnalyze", SMS_EXPORT, "fixture.xml");
      expect((h.s.outcome as Outcome).proposals.length).toBeGreaterThan(0);
      h.s.isMinor = null;
      await h.ratifyAll();
      expect(h.writes).toHaveLength(0);
      expect(h.s.importErr).toBe(true);
    }
  });

  test("잠긴 타일 표시도 같은 규칙이다 - 모름이면 잠김으로 보인다", () => {
    const locked = declaration(sf, "locked").initializer!.getText(sf);
    const lockedTile = { minorLocked: true };
    expect(evaluate(locked, { s: lockedTile, isMinor: true })).toBe(true);
    expect(evaluate(locked, { s: lockedTile, isMinor: null })).toBe(true);
    expect(evaluate(locked, { s: lockedTile, isMinor: false })).toBe(false);
    expect(evaluate(locked, { s: { minorLocked: false }, isMinor: null })).toBe(false);
  });
});

describe("외부 가져오기(/import) - 기기 건강 잠금은 모름도 막는다", () => {
  const sf = parse("src/screens/deepspace/dds-import-inbox-screens.tsx");
  const screen = find(
    sf,
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpaceImportScreen",
  )[0];

  test("동의 핸들러: 확인된 성인만 선호를 읽고 저장한다", async () => {
    const handler = find(
      screen,
      (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "handleHealthConsent",
    )[0];
    for (const isMinor of AGES) {
      const calls: string[] = [];
      const s: Record<string, unknown> = {
        userId: "synthetic-user",
        healthBusy: false,
        isMinor,
        ko: false,
        fetchPrivacyPrefs: async () => {
          calls.push("fetchPrivacyPrefs");
          return {};
        },
        savePrivacyPrefs: async () => {
          calls.push("savePrivacyPrefs");
        },
        setHealthBusy: () => undefined,
        setHealthPref: () => undefined,
      };
      vm.createContext(s);
      vm.runInContext(toJs(handler.getText(sf)), s);
      await (s.handleHealthConsent as () => Promise<void>)();
      expect({ isMinor, calls }).toEqual({ isMinor, calls: isMinor === false ? ["fetchPrivacyPrefs", "savePrivacyPrefs"] : [] });
    }
  });

  test("버튼 문구 · 누르기 · 색이 모두 모름을 잠김으로 본다", () => {
    const cta = declaration(sf, "healthCta").initializer!.getText(sf);
    const press = find(
      screen,
      (node): node is ts.JsxAttribute =>
        ts.isJsxAttribute(node) && node.name.getText(sf) === "onPress" && node.getText(sf).includes("handleHealthConsent"),
    );
    const tone = find(
      screen,
      (node): node is ts.ConditionalExpression =>
        ts.isConditionalExpression(node) && node.whenFalse.getText(sf) === "m3.color.primary" && node.condition.getText(sf).includes("isMinor"),
    );
    expect(press).toHaveLength(1);
    expect(tone).toHaveLength(1);
    const pressExpression = (press[0].initializer as ts.JsxExpression).expression!.getText(sf);
    for (const isMinor of AGES) {
      const scope = {
        isMinor,
        healthBusy: false,
        healthDone: null,
        canHealth: false,
        t: (key: string) => key,
        m3: { color: { onSurfaceVariant: "muted", primary: "primary" } },
        handleHealthIngest: () => undefined,
        handleHealthConsent: () => undefined,
      };
      const open = isMinor === false;
      expect({ isMinor, cta: evaluate(cta, scope) }).toEqual({ isMinor, cta: open ? "ds.import.healthCtaConnect" : "ds.import.healthCtaMinorLocked" });
      expect({ isMinor, pressable: typeof evaluate(pressExpression, scope) === "function" }).toEqual({ isMinor, pressable: open });
      expect({ isMinor, tone: evaluate(tone[0].getText(sf), scope) }).toEqual({ isMinor, tone: open ? "primary" : "muted" });
    }
  });

  test("로딩 중에는 잠금 문구 대신 로딩을 그린다", () => {
    const statements = screen.body!.statements;
    const loadingIndex = statements.findIndex((s) => ts.isIfStatement(s) && s.expression.getText(sf) === "authLoading");
    const renderIndex = statements.findIndex((s) => ts.isReturnStatement(s));
    expect(loadingIndex).toBeGreaterThan(-1);
    expect(renderIndex).toBeGreaterThan(loadingIndex);
  });
});

describe("통화 회고(/call-reflection) - 성인 · 한국어 한정 게이트는 모름도 막는다", () => {
  const sf = parse("src/app/call-reflection.tsx");
  const screen = sf.statements.find(
    (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "CallReflection",
  )!;
  const statements = screen.body!.statements;
  const loadingIndex = statements.findIndex((s) => ts.isIfStatement(s) && s.expression.getText(sf) === "loading");
  const gateIndex = statements.findIndex(
    (s) =>
      ts.isIfStatement(s) &&
      find(s.expression, (node): node is ts.Identifier => ts.isIdentifier(node) && node.text === "isMinor").length > 0,
  );

  test("확인된 성인 + 한국어만 연다", () => {
    expect(gateIndex).toBeGreaterThan(-1);
    const condition = (statements[gateIndex] as ts.IfStatement).expression.getText(sf);
    for (const ko of [true, false]) {
      for (const isMinor of AGES) {
        const blocked = !(ko && isMinor === false);
        expect({ ko, isMinor, blocked: evaluate(condition, { ko, isMinor }) }).toEqual({ ko, isMinor, blocked });
      }
    }
  });

  test("로딩 갈래가 게이트보다 앞이다 - 모름으로 막힌 화면이 로딩 중에 깜빡이지 않는다", () => {
    expect(loadingIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(loadingIndex);
  });
});

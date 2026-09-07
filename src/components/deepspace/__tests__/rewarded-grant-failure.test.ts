import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// 보상형 광고를 끝까지 본 뒤 적립이 실패해도 시트가 성공과 똑같이 닫히는 문제를 잡는다.
//
// 사용자는 광고 시간을 내주고 아무것도 받지 못한 채 이유도 듣지 못한다. 월 적립
// 상한에 도달한 경우도 같은 모양이라 "왜 안 늘었지" 를 물을 자리가 없다.
// RewardedSheet 의 onWatch 는 onEarned 를 await 하지 않고 finally 에서 곧바로
// onClose 를 부르므로, 호출자가 아무리 잘 잡아도 시트는 이미 닫혀 있다.
//
// 이 저장소는 컴포넌트 렌더 테스트가 막혀 있다(RN 0.85 upstream). 대신 실제 선언
// (RewardedSheet 의 onWatch, secondb 화면의 onEarned)만 AST 로 떼어 inert 호스트에
// 걸고 돌린다. 재구현이 아니라 실제 본문이고, 광고·결제·인증 경계는 하나도
// 로드되지 않는다. Round22 의 담기 실패 하네스와 같은 방식이다.
const SHEET_FILE = resolve(__dirname, "../RewardedSheet.tsx");
const SCREEN_FILE = resolve(__dirname, "../../../app/secondb.tsx");
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function parse(file: string) {
  const source = readFileSync(file, "utf8");
  return { source, ast: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}
const SHEET = parse(SHEET_FILE);
const SCREEN = parse(SCREEN_FILE);

const localeJson = (code: string) =>
  JSON.parse(readFileSync(resolve(__dirname, "../../../../locales", code, "deepspace.json"), "utf8")) as {
    ds: { reward: Record<string, string>; rewardChat: Record<string, string> };
  };

function walk(node: ts.Node, visit: (n: ts.Node) => boolean | void): void {
  if (visit(node) === true) return;
  node.forEachChild((child) => walk(child, visit));
}

/** `const <name> = ...` 초기화식을 통째로 떼어낸다. */
function findConstInit(tree: typeof SHEET, name: string): string {
  let found: string | null = null;
  walk(tree.ast, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      found = node.initializer.getText(tree.ast);
      return true;
    }
  });
  if (!found) throw new Error(`${name} 선언을 찾지 못했다`);
  return found;
}

/** `<RewardedSheet ... onEarned={...}>` 의 핸들러들을 등장 순서대로 떼어낸다. */
function findRewardedSheetHandlers(attribute: string): string[] {
  const found: string[] = [];
  walk(SCREEN.ast, (node) => {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;
    if (!opening || opening.tagName.getText(SCREEN.ast) !== "RewardedSheet") return;
    for (const property of opening.attributes.properties) {
      if (!ts.isJsxAttribute(property) || property.name.getText(SCREEN.ast) !== attribute) continue;
      const value = property.initializer;
      if (value && ts.isJsxExpression(value) && value.expression) found.push(value.expression.getText(SCREEN.ast));
    }
  });
  if (found.length === 0) throw new Error(`RewardedSheet 의 ${attribute} 핸들러를 찾지 못했다`);
  return found;
}

function run<T>(source: string, bindings: Record<string, unknown>): T {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as T;
}

type Outcome = "granted" | "capped" | "unconfirmed";

interface SheetRun {
  closes: number;
  outcomes: (Outcome | null)[];
  announced: string[];
  earnedWith: number[];
  rejected: unknown[];
}

/** 실제 onWatch 본문을 inert 호스트에 걸고 관측 가능한 상태를 돌려준다. */
async function watch(options: {
  completed?: boolean;
  onEarned: (credits: number) => unknown;
  watching?: boolean;
}): Promise<SheetRun> {
  const state: SheetRun = { closes: 0, outcomes: [], announced: [], earnedWith: [], rejected: [] };
  const watchingRef = { current: options.watching ?? false };
  const bindings = {
    watchingRef,
    userId: "local-owner",
    kind: "chat",
    REWARD_PER_WATCH: 2,
    showRewardedAd: async () => ({ completed: options.completed ?? true }),
    onEarned: async (credits: number) => {
      state.earnedWith.push(credits);
      return options.onEarned(credits);
    },
    onClose: () => { state.closes += 1; },
    setEarnOutcome: (value: Outcome | null) => { state.outcomes.push(value); },
    AccessibilityInfo: { announceForAccessibility: (message: string) => state.announced.push(message) },
    // 문구는 로케일에서 오지만 이 하네스는 문구 내용이 아니라 어느 문구를
    // 골랐는지만 본다.
    C: { capReached: "CAP", creditFailed: "FAILED" },
  };
  const onWatch = run<() => Promise<void>>(
    `const onWatch = ${findConstInit(SHEET, "onWatch")};\nreturn onWatch;`,
    bindings,
  );
  // 떠다니는 거부를 잡아 둔다. 잡지 않으면 이 케이스가 단언 실패가 아니라
  // 워커 프로세스 종료로 나타나 나머지 테스트의 결과를 못 보게 된다.
  const floating = (reason: unknown) => { state.rejected.push(reason); };
  process.on("unhandledRejection", floating);
  try {
    await onWatch().catch(floating);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  } finally {
    process.off("unhandledRejection", floating);
  }
  return state;
}

describe("보상형 광고 적립이 실패하면 시트가 성공처럼 닫히지 않는다", () => {
  test("적립이 되면 지금까지처럼 시트를 닫는다", async () => {
    const state = await watch({ onEarned: () => undefined });
    expect(state.earnedWith).toEqual([2]);
    expect(state.closes).toBe(1);
    expect(state.outcomes.filter(Boolean)).toEqual([]);
    expect(state.announced).toEqual([]);
  });

  test("호출자가 적립 실패를 알리면 시트를 닫지 않는다", async () => {
    const state = await watch({ onEarned: () => "unconfirmed" });
    expect(state.closes).toBe(0);
    expect(state.outcomes).toContain("unconfirmed");
    expect(state.announced).toEqual(["FAILED"]);
  });

  test("월 적립 상한은 일반 실패와 구별해서 알린다", async () => {
    const state = await watch({ onEarned: () => "capped" });
    expect(state.closes).toBe(0);
    expect(state.outcomes).toContain("capped");
    expect(state.announced).toEqual(["CAP"]);
  });

  test("호출자가 분류하지 못하고 던져도 조용히 새어 나가지 않는다", async () => {
    const state = await watch({
      onEarned: () => { throw new Error("grant_rpc_failed"); },
    });
    // 지금은 onEarned 의 거부가 떠다니는 프로미스가 되어 아무 데도 닿지 않는다.
    expect(state.rejected).toEqual([]);
    expect(state.closes).toBe(0);
    expect(state.outcomes).toContain("unconfirmed");
  });

  test("광고를 끝까지 보지 않으면 적립을 시도하지도, 실패를 알리지도 않는다", async () => {
    const state = await watch({ completed: false, onEarned: () => "unconfirmed" });
    expect(state.earnedWith).toEqual([]);
    expect(state.closes).toBe(1);
    expect(state.outcomes.filter(Boolean)).toEqual([]);
  });

  test("이미 보는 중이면 두 번째 누름은 아무것도 하지 않는다", async () => {
    const state = await watch({ watching: true, onEarned: () => "unconfirmed" });
    expect(state.earnedWith).toEqual([]);
    expect(state.closes).toBe(0);
    expect(state.outcomes).toEqual([]);
  });

  test("실패한 뒤에도 시트를 다시 열면 표시가 남아 있지 않다", () => {
    // 시트가 열릴 때 결과 표시를 지우는 자리가 실제로 있는지 본문으로 확인한다.
    const source = SHEET.source;
    expect(source).toMatch(/setEarnOutcome\(null\)/);
    const reset = source.match(/useEffect\(\(\)\s*=>\s*\{[^}]*setEarnOutcome\(null\)[\s\S]{0,120}?\},\s*\[[^\]]*visible[^\]]*\]\)/);
    expect(reset).not.toBeNull();
  });
});

describe("대화 화면이 적립 실패를 분류해서 시트에 돌려준다", () => {
  const handlers = () => findRewardedSheetHandlers("onEarned");

  async function earn(options: { throws?: unknown; index: number }): Promise<{ outcome: unknown; refreshes: number; warnings: string[]; grants: number }> {
    const state = { refreshes: 0, warnings: [] as string[], grants: 0 };
    class ChatRewardCapReachedError extends Error {
      readonly code = "chat_reward_cap_reached";
      constructor() { super("chat_reward_cap_reached"); this.name = "ChatRewardCapReachedError"; }
    }
    const bindings = {
      userId: "local-owner",
      ChatRewardCapReachedError,
      grantChatAdBonus: async () => {
        state.grants += 1;
        if (options.throws === "cap") throw new ChatRewardCapReachedError();
        if (options.throws) throw options.throws;
        return 2;
      },
      refreshChatUsage: async () => { state.refreshes += 1; },
      setChatRewardVisible: () => { throw new Error("시트를 닫는 일은 이제 시트가 한다"); },
      console: { warn: (...args: unknown[]) => state.warnings.push(args.join(" ")) },
    };
    const handler = run<(credits: number) => Promise<unknown>>(
      `const onEarned = ${handlers()[options.index]};\nreturn onEarned;`,
      bindings,
    );
    return { outcome: await handler(2), ...state };
  }

  test("두 셸(deep-space·legacy) 모두 같은 핸들러 모양을 쓴다", () => {
    expect(handlers()).toHaveLength(2);
  });

  for (const index of [0, 1]) {
    test(`핸들러 ${index}: 적립되면 결과를 보고하지 않고 사용량만 다시 읽는다`, async () => {
      const state = await earn({ index });
      expect(state.grants).toBe(1);
      expect(state.refreshes).toBe(1);
      expect(state.outcome === undefined || state.outcome === "granted").toBe(true);
    });

    test(`핸들러 ${index}: 월 상한은 capped 로 돌려준다`, async () => {
      const state = await earn({ index, throws: "cap" });
      expect(state.outcome).toBe("capped");
      // 상한에 걸려도 서버 숫자가 진실이므로 다시 읽는 것은 유지한다.
      expect(state.refreshes).toBe(1);
    });

    test(`핸들러 ${index}: 그 밖의 실패는 unconfirmed 로 돌려준다`, async () => {
      const state = await earn({ index, throws: new Error("network") });
      expect(state.outcome).toBe("unconfirmed");
      expect(state.refreshes).toBe(1);
    });
  }
});

describe("적립 실패 문구", () => {
  const keys = ["capReached", "creditFailed"] as const;

  test("다섯 로케일 두 네임스페이스에 모두 있다", () => {
    for (const code of LOCALES) {
      const ds = localeJson(code).ds;
      for (const namespace of ["reward", "rewardChat"] as const) {
        for (const key of keys) {
          expect(typeof ds[namespace][key]).toBe("string");
          expect(ds[namespace][key].trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("es·pt·id 가 영어 그대로가 아니다", () => {
    const en = localeJson("en").ds;
    for (const code of ["es", "pt", "id"] as const) {
      const ds = localeJson(code).ds;
      for (const namespace of ["reward", "rewardChat"] as const) {
        for (const key of keys) expect(ds[namespace][key]).not.toBe(en[namespace][key]);
      }
    }
  });

  test("적립되지 않았다고 단정하지 않는다", () => {
    // SSV 모드에서는 서버가 적립의 유일한 주체다. 클라이언트가 실패했다고
    // 해서 적립이 안 된 것은 아니므로 단정하면 사실과 달라질 수 있다.
    // Round22 의 담기 실패 문구와 같은 규율이다.
    for (const code of LOCALES) {
      const ds = localeJson(code).ds;
      for (const namespace of ["reward", "rewardChat"] as const) {
        const copy = ds[namespace].creditFailed;
        expect(copy).not.toMatch(/적립되지 않았|받지 못했습니다|not credited|was not added|no se acreditó|não foi creditado|tidak dikreditkan/i);
      }
    }
  });

  test("한국어는 이 파일의 말투를 따른다", () => {
    const ds = localeJson("ko").ds;
    for (const namespace of ["reward", "rewardChat"] as const) {
      for (const key of keys) {
        // 이 파일의 실측 어미 분포를 따른다: 습니다 99건, 세요 계열 42건.
        expect(ds[namespace][key]).toMatch(/(습니다|해요|어요|아요|세요)[.!]?$/);
        // 이 파일에는 '주십시오' 가 한 건도 없다. 새 문구가 첫 건이 되면 안 된다.
        expect(ds[namespace][key]).not.toMatch(/주십시오|하십시오/);
      }
    }
  });

  test("em dash 를 쓰지 않는다", () => {
    for (const code of LOCALES) {
      const ds = localeJson(code).ds;
      for (const namespace of ["reward", "rewardChat"] as const) {
        for (const key of keys) expect(ds[namespace][key]).not.toContain("—");
      }
    }
  });
});

describe("시트가 실패를 실제로 화면에 그린다", () => {
  test("결과 문구가 live region 으로 붙는다", () => {
    expect(SHEET.source).toMatch(/accessibilityLiveRegion="polite"/);
    expect(SHEET.source).toMatch(/earnOutcome === "capped" \? C\.capReached : C\.creditFailed/);
  });

  test("실패한 뒤에는 시청 버튼을 다시 내밀지 않는다", () => {
    // 상한이면 다시 봐도 못 받고, 확인 실패면 이중 적립 위험이 있다.
    expect(SHEET.source).toMatch(/earnOutcome \? null :/);
  });

  test("문구 색은 캐논 토큰에서 온다", () => {
    const style = SHEET.source.match(/earnNotice:\s*\{[^}]*\}/);
    expect(style).not.toBeNull();
    expect(style?.[0]).toMatch(/deepSpace\.\w+/);
    expect(style?.[0]).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

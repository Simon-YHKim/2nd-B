import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// 담기가 실패했을 때 화면이 아무 말도 하지 않는 문제를 잡는다.
//
// 같은 화면이 복사 경로에는 이미 성공/실패 캡션을 붙여 뒀는데(copyNotice +
// announceForAccessibility) 저장 경로만 console.warn 으로 삼킨다. 저장은 복사보다
// 결과가 무겁다 - 담긴 내용이 exportUserWiki 를 타고 다음 대화와 비서 제안을
// 먹이기 때문에, 실패를 모르면 사용자는 남아 있다고 믿은 말을 잃는다.
//
// secondb.tsx 는 2,400줄이라 화면 전체를 inert 로 돌릴 수 없다. 대신 실제 선언
// (keepExchange · exchangeAt 함수, 공용 위기 판정 keepCrisisHotline, 자동 저장 effect 와
// 그 결과를 받는 effect)만 AST 로 떼어 실행한다. 재구현이 아니라 실제 본문이고,
// 저장/인증/모델 경계는 하나도 로드되지 않는다.
//
// PR 1814 재설계 C5 (2026-09-17): 자동 저장은 이제 화면이 아니라 실행기(lib/chat/autosave-runner.ts)가
// 한다. 화면은 답변을 넘기고 결과 알림을 받는다. 그래서 둘째 묶음은 "실패하면 표시를 되돌린다" 대신
// "실패 알림을 받으면 손 담기와 같은 안내를 띄운다" 를 본다. 담는 중도 화면 전역 하나가 아니라 턴마다다.
const FILE = resolve(__dirname, "../secondb.tsx");
const SOURCE = readFileSync(FILE, "utf8");
const AST = ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
const localeJson = (code: string) =>
  JSON.parse(readFileSync(resolve(__dirname, "../../../locales", code, "secondb.json"), "utf8")) as Record<string, unknown>;

function walk(node: ts.Node, visit: (n: ts.Node) => boolean | void): void {
  if (visit(node) === true) return;
  node.forEachChild((child) => walk(child, visit));
}

function findFunction(name: string): string {
  let found: string | null = null;
  walk(AST, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node.getText(AST);
      return true;
    }
  });
  if (!found) throw new Error(`${name} 선언을 찾지 못했다`);
  return found;
}

/** 본문에 marker 가 들어 있는 useEffect 호출문 하나를 통째로 떼어낸다. */
function findEffect(marker: string): string {
  let found: string | null = null;
  walk(AST, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect") {
      const text = node.getText(AST);
      if (text.includes(marker) && !found) found = text;
    }
  });
  if (!found) throw new Error(`${marker} 를 포함한 useEffect 를 찾지 못했다`);
  return found;
}

function run<T>(source: string, tail: string, bindings: Record<string, unknown>): T {
  const compiled = ts.transpileModule(source + "\n" + tail, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as T;
}

const REPLY = { role: "secondb" as const, text: "이번 주에 걸었던 길에 대한 답변." };
const PROMPT = { role: "user" as const, text: "이번 주에 어디를 걸었더라?" };
const REPLY_2 = { role: "secondb" as const, text: "다음 주에 걸을 길에 대한 답변." };
const PROMPT_2 = { role: "user" as const, text: "다음 주에는 어디를 걸을까?" };

interface Host {
  keep: (index: number) => Promise<unknown>;
  state: {
    kept: Set<object>;
    keepingTurns: Set<object>;
    notice: unknown[];
    announced: string[];
    crisis: unknown[];
    captures: unknown[];
    warnings: string[];
    current: unknown;
    /** 손 담기가 쥐었다가 푼 턴별 잠금. */
    released: object[];
    /** 손 담기가 계정 줄(runManualKeep)에 선 계정. */
    lanes: string[];
    /** 줄에 선 것과 capture 의 순서. */
    order: string[];
    /** 위기 분류를 돌린 본문. */
    classified: string[];
  };
}

/** 공용 위기 판정(모듈 수준 keepCrisisHotline)을 실제 본문으로 만든다. 분류기는 부른 본문을 적는 목이다. */
function crisisHotline(classified: string[], zone = "green") {
  return run<(body: string, locale: "en" | "ko", isMinor: boolean | null) => string | null>(
    findFunction("keepCrisisHotline"),
    "return keepCrisisHotline;",
    {
      classifyInput: (body: string) => {
        classified.push(body);
        return { zone };
      },
    },
  );
}

/** 실제 keepExchange 본문을 inert 호스트에 걸고 관측 가능한 상태를 돌려준다. */
function keepHost(
  options: {
    capture?: () => Promise<unknown>;
    kept?: Set<object>;
    keeping?: Set<object>;
    /** 자동 저장이 이 턴들을 확인 · 쓰기 · 되돌리는 중이다(턴별 잠금을 못 얻는다). */
    autoBusy?: Set<object>;
    notice?: unknown;
    /** 계정 줄이 capture 뒤에 담김을 확인해 주지 않는다(정확 중복인데 되돌리기 대기 기록에서 빼지 못했다). */
    keepRefused?: boolean;
  } = {},
): Host {
  const state: Host["state"] = {
    kept: new Set(options.kept ?? []),
    keepingTurns: new Set(options.keeping ?? []),
    notice: [],
    announced: [],
    crisis: [],
    captures: [],
    warnings: [],
    current: options.notice ?? null,
    released: [],
    lanes: [],
    order: [],
    classified: [],
  };
  const bindings = {
    userId: "local-owner",
    keptTurns: state.kept,
    keepingTurns: new Set(state.keepingTurns),
    // r3as2 R3AS2-02: 담긴 표시는 턴 객체에 붙는다. 두 답변이 같은 객체면 한쪽을 담는 순간 다른 쪽도 담긴
    // 것이 되므로 짝마다 다른 객체를 둔다.
    turns: [PROMPT, REPLY, PROMPT_2, REPLY_2],
    isKeepable: (turn: { role: string }) => turn.role === "secondb",
    holdTurnForManualKeep: (turn: object) => (options.autoBusy?.has(turn) ? null : () => void state.released.push(turn)),
    setKeepingTurns: (fn: (prev: Set<object>) => Set<object>) => {
      state.keepingTurns = fn(state.keepingTurns);
    },
    // 실행기의 손 담기 줄(runManualKeep) 자리. 줄의 규칙(되돌리기와 한 줄 · 정확 중복이면 대기 기록에서 빼기)은
    // 실행기 테스트가 실제로 돌린다. 여기서는 화면이 capture 를 줄 안에서 부르는지와 줄의 거절을 어떻게 받는지만 본다.
    runManualKeep: async (ownerId: string, capture: () => Promise<unknown>) => {
      state.lanes.push(ownerId);
      state.order.push("lane");
      const kept = await capture();
      if (options.keepRefused) throw new Error("autosave-undo-not-forgotten");
      return kept;
    },
    keepCrisisHotline: crisisHotline(state.classified),
    setKeptTurns: (fn: (prev: Set<object>) => Set<object>) => { state.kept = fn(state.kept); },
    // 실패 안내 자리. 실제 setState 처럼 updater 함수도 받아 적용한다.
    setKeepNotice: (value: unknown) => {
      const next = typeof value === "function" ? (value as (prev: unknown) => unknown)(state.current) : value;
      state.current = next;
      state.notice.push(next);
    },
    setKeepCrisis: (value: unknown) => state.crisis.push(value),
    findPrompt: () => PROMPT,
    isCharacterChat: false,
    persona: { name: { ko: "세컨비", en: "SecondB" } },
    locale: "ko",
    t: (key: string) => key,
    exchangeTopic: () => "산책",
    composeExchangeBody: () => "정상 로컬 fixture 본문",
    exchangeMarkdown: (topic: string, body: string) => `## ${topic}\n\n${body}`,
    CHAT_KEEP_TAG: "chat:keep",
    isMinor: false,
    captureFromMarkdown: async (payload: unknown) => {
      state.captures.push(payload);
      state.order.push("capture");
      if (options.capture) return options.capture();
      return { source: { id: "clip-1" }, deduped: null };
    },
    AccessibilityInfo: { announceForAccessibility: (msg: string) => state.announced.push(msg) },
    console: { warn: (...args: unknown[]) => state.warnings.push(args.join(" ")) },
  };
  // 손 담기와 자동 저장이 같은 본문을 쓴다 - exchangeAt 을 함께 뗀다.
  const keep = run<Host["keep"]>(`${findFunction("exchangeAt")}\n${findFunction("keepExchange")}`, "return keepExchange;", bindings);
  return { keep, state };
}

describe("담기 실패를 화면이 말한다", () => {
  test("성공하면 담긴 것으로 표시하고 실패 안내는 띄우지 않는다", async () => {
    const host = keepHost();
    await host.keep(1);
    expect(host.state.captures).toHaveLength(1);
    expect(host.state.kept.has(REPLY)).toBe(true);
    expect(host.state.notice.filter(Boolean)).toEqual([]);
    expect(host.state.warnings).toEqual([]);
  });

  test("실패하면 담긴 것으로 표시하지 않고, 담는 중 표시와 턴별 잠금을 푼다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    expect(host.state.kept.has(REPLY)).toBe(false);
    expect(host.state.keepingTurns.has(REPLY)).toBe(false);
    expect(host.state.released).toEqual([REPLY]);
  });

  test("실패를 화면 상태로 알린다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    const notices = host.state.notice.filter(Boolean) as { turn: object; ok: boolean }[];
    expect(notices).toHaveLength(1);
    expect(notices[0].turn).toBe(REPLY);
    expect(notices[0].ok).toBe(false);
  });

  test("실패를 스크린리더로도 알린다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    expect(host.state.announced).toEqual(["keepFailed"]);
  });

  test("같은 턴을 다시 누르면 그 턴의 실패 안내부터 지운다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    const afterFirst = host.state.notice.length;
    await host.keep(1);
    expect(host.state.notice[afterFirst]).toBeNull();
  });

  test("다른 턴을 담아도 앞선 실패 안내는 남는다", async () => {
    // 자동 담기가 새 턴을 성공시키는 순간 아직 읽지 않은 실패가 사라지면
    // 이번 회차가 없애려는 그 조용함이 그대로 돌아온다.
    const host = keepHost({ notice: { turn: REPLY, ok: false } });
    await host.keep(3);
    expect(host.state.kept.has(REPLY_2)).toBe(true);
    expect(host.state.current).toEqual({ turn: REPLY, ok: false });
  });

  test("성공 여부를 호출자에게 돌려준다", async () => {
    await expect(keepHost().keep(1)).resolves.toBe(true);
    await expect(keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) }).keep(1)).resolves.toBe(false);
  });

  // 옛 이름: "이미 담겼거나 처리 중이면 아무 일도 하지 않는다". 담는 중이 화면 전역 하나에서 턴마다로 바뀌었다
  // (PR 1814 재설계 C5, 설계 N1) - 다른 답변을 담는 중인 것은 이 답변을 막지 않는다.
  test("이미 담겼거나 그 답변을 담는 중이면 아무 일도 하지 않고, 다른 답변을 담는 중인 것은 막지 않는다", async () => {
    const already = keepHost({ kept: new Set([REPLY]) });
    await already.keep(1);
    expect(already.state.captures).toEqual([]);
    const busy = keepHost({ keeping: new Set([REPLY]) });
    await busy.keep(1);
    expect(busy.state.captures).toEqual([]);
    // 자동 저장이 같은 답변을 쥐고 있으면 턴별 잠금을 못 얻는다 - 같은 짝이 두 번 capture 에 들어가지 않는다.
    const auto = keepHost({ autoBusy: new Set([REPLY]) });
    await expect(auto.keep(1)).resolves.toBe(false);
    expect(auto.state.captures).toEqual([]);
    const other = keepHost({ keeping: new Set([REPLY_2]), autoBusy: new Set([REPLY_2]) });
    await expect(other.keep(1)).resolves.toBe(true);
    expect(other.state.captures).toHaveLength(1);
  });

  test("위기 분류는 실제로 담긴 뒤에만 돈다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    expect(host.state.crisis).toEqual([]);
    expect(host.state.classified).toEqual([]);
    const kept = keepHost();
    await kept.keep(1);
    expect(kept.state.classified).toEqual(["정상 로컬 fixture 본문"]);
  });

  // 옛 이름: "이미 있는 행을 돌려받으면(정확 중복) 그 행을 되돌리기 대기 기록에서 뺀다 - 새로 담은 행이면 건드리지 않는다".
  // 그 규칙(설계 2-10)은 실행기의 runManualKeep 으로 옮겼다 - 화면이 대기 기록 빼기를 기다리지 않고(fire-and-forget)
  // 담김을 띄웠고, 진행 중인 비우기와 줄을 서지 않아 담김 뒤에 행이 지워졌다(게이트 r260919 DA-1814-1 · DZ-1814-3).
  test("손 담기는 capture 를 계정 줄(runManualKeep) 안에서 부르고, 줄이 담김을 확인해 주지 않으면 담김으로 치지 않는다", async () => {
    const host = keepHost({ capture: async () => ({ source: { id: "row-9" }, deduped: "exact_duplicate" }) });
    await expect(host.keep(1)).resolves.toBe(true);
    expect({ lanes: host.state.lanes, order: host.state.order, kept: host.state.kept.has(REPLY) }).toEqual({
      lanes: ["local-owner"],
      order: ["lane", "capture"],
      kept: true,
    });

    // 정확 중복인데 되돌리기 대기 기록에서 빼지 못했다 - 다음 비우기가 그 행을 지울 수 있다. 담겼다고 말하지 않는다.
    const refused = keepHost({ keepRefused: true, capture: async () => ({ source: { id: "row-9" }, deduped: "exact_duplicate" }) });
    await expect(refused.keep(1)).resolves.toBe(false);
    expect({
      kept: refused.state.kept.has(REPLY),
      notice: refused.state.notice.filter(Boolean),
      announced: refused.state.announced,
      classified: refused.state.classified,
      released: refused.state.released,
    }).toEqual({ kept: false, notice: [{ turn: REPLY, ok: false }], announced: ["keepFailed"], classified: [], released: [REPLY] });
  });
});

describe("자동 담기는 실패를 삼키지 않는다", () => {
  // 자동 저장은 실행기가 한다(PR 1814 재설계 C5). 화면이 하는 일은 둘이다: 자격이 맞는 마지막 답변을 넘기고, 결과
  // 알림을 받아 손 담기와 같은 표시를 한다. 동의 확인 · 쓰기 · 되돌리기와 그 경쟁은 실행기 테스트
  // (lib/chat/__tests__/autosave-runner.test.ts)가, 화면 왕복은 secondb-autosave-consent-roundtrip.test.ts 가 돌린다.
  interface AutosaveScreen {
    kept: Set<object>;
    /** 실패 안내 자리가 바뀐 기록(바뀌지 않는 setState 는 적지 않는다). */
    notice: unknown[];
    current: unknown;
    announced: string[];
    crisis: unknown[];
    renders: number;
    started: { ownerId: string; reply: object; askedGeneration: number; rawMd: string }[];
    emit: (update: { ownerId: string; reply: object; sourceId: string; phase: string }) => void;
    handOff: () => void;
  }

  function autosaveScreen(zone = "green"): AutosaveScreen {
    const classified: string[] = [];
    const screen = {
      kept: new Set<object>(),
      notice: [] as unknown[],
      current: null as unknown,
      announced: [] as string[],
      crisis: [] as unknown[],
      renders: 0,
      started: [] as AutosaveScreen["started"],
      emit: (() => undefined) as AutosaveScreen["emit"],
      handOff: () => undefined,
    };
    const bodies = { current: new WeakMap<object, string>() };
    const shared = {
      useEffect: (fn: () => void) => {
        fn();
      },
      userId: "local-owner",
      locale: "ko",
      isMinor: false,
      t: (key: string) => key,
      autosaveBodiesRef: bodies,
      keepCrisisHotline: crisisHotline(classified, zone),
      setKeptTurns: (fn: (prev: Set<object>) => Set<object>) => {
        screen.kept = fn(screen.kept);
      },
      // 실제 setState 처럼 updater 함수도 받는다. 값이 그대로면 바뀐 것이 아니다.
      setKeepNotice: (value: unknown) => {
        const next = typeof value === "function" ? (value as (prev: unknown) => unknown)(screen.current) : value;
        if (Object.is(next, screen.current)) return;
        screen.current = next;
        screen.notice.push(next);
      },
      setKeepCrisis: (value: unknown) => screen.crisis.push(value),
      setAutosaveRender: () => {
        screen.renders += 1;
      },
      AccessibilityInfo: { announceForAccessibility: (msg: string) => screen.announced.push(msg) },
    };
    run(findEffect("subscribeAutosaveJobs("), "", {
      ...shared,
      subscribeAutosaveJobs: (listener: AutosaveScreen["emit"]) => {
        screen.emit = listener;
        return () => undefined;
      },
    });
    screen.handOff = () =>
      run(findEffect("startAutosaveJob("), "", {
        ...shared,
        chatAutosaveAllowed: (value: unknown) => value === true,
        autosaveConsent: true,
        turns: [PROMPT, REPLY],
        keptTurns: screen.kept,
        prefsReadKey: 0,
        isKeepable: (turn: { role: string }) => turn.role === "secondb",
        findPromptIndex: () => 0,
        // r3as2 R2-H1: 짝의 질문(PROMPT)은 지금과 같은 동의 세대에서 켜진 채 보낸 것으로 둔다.
        autosaveAskedRef: { current: new WeakMap<object, number>([[PROMPT, 0]]) },
        autosaveConsentFor: () => ({ value: true, generation: 0 }),
        exchangeAt: () => ({ body: "정상 로컬 fixture 본문", rawMd: "## 산책\n\n정상 로컬 fixture 본문" }),
        startAutosaveJob: (request: AutosaveScreen["started"][number]) => {
          screen.started.push(request);
          return { sourceId: "job-1", settled: Promise.resolve("kept") };
        },
      });
    return screen;
  }

  // 옛 이름: "동의가 켜져 있으면 마지막 담을 수 있는 턴을 한 번 담는다".
  test("동의가 켜져 있으면 마지막 담을 수 있는 턴을 실행기에 한 번 넘긴다", () => {
    const screen = autosaveScreen();
    screen.handOff();
    expect(screen.started).toEqual([
      { ownerId: "local-owner", reply: REPLY, askedGeneration: 0, rawMd: "## 산책\n\n정상 로컬 fixture 본문" },
    ]);
  });

  // 옛 이름: "성공하면 다시 담지 않도록 표시가 남는다".
  test("담겼다는 알림이 오면 담김 표시가 남고, 그 답변은 다시 넘기지 않는다", () => {
    const screen = autosaveScreen();
    screen.handOff();
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "kept" });
    expect(screen.kept.has(REPLY)).toBe(true);
    expect(screen.notice).toEqual([]);
    screen.handOff();
    expect(screen.started).toHaveLength(1);
  });

  // 옛 이름: "실패하면 표시를 되돌려 다시 담을 수 있게 한다".
  test("실패 알림이 오면 손 담기와 같은 실패 안내를 띄우고 담김으로 치지 않는다", () => {
    const screen = autosaveScreen();
    screen.handOff();
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "failed" });
    expect(screen.kept.has(REPLY)).toBe(false);
    expect(screen.notice).toEqual([{ turn: REPLY, ok: false }]);
    expect(screen.announced).toEqual(["keepFailed"]);
  });

  test("철회한 저장을 지우지도 기기에 적지도 못했다는 알림(undo_unrecorded)이 오면 아직 삭제하지 못했다고 알리고, 다 지웠다는 알림이 오면 거둔다 (게이트 r260919 DA-1814-2)", () => {
    // 담기 실패 안내(keepFailed)를 쓰면 안 된다 - 뒷절이 "다시 담아 주세요" 라서, 지우길 원한 사용자에게 반대로 말한다.
    const screen = autosaveScreen();
    screen.handOff();
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "undo_unrecorded" });
    expect({ kept: screen.kept.has(REPLY), notice: screen.notice, announced: screen.announced }).toEqual({
      kept: false,
      notice: [{ turn: REPLY, ok: false, notDeleted: true }],
      announced: ["chatSaveNotDeleted"],
    });
    // 다른 답변이 지워졌다는 알림은 이 안내를 거두지 않는다.
    screen.emit({ ownerId: "local-owner", reply: REPLY_2, sourceId: "job-2", phase: "cancelled" });
    expect(screen.current).toEqual({ turn: REPLY, ok: false, notDeleted: true });
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "cancelled" });
    expect(screen.current).toBeNull();
  });

  test("다 지웠다는 알림은 담기 실패 안내를 거두지 않는다 - 그 안내는 사용자가 다시 누를 때까지 남는다", () => {
    const screen = autosaveScreen();
    screen.handOff();
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "failed" });
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "cancelled" });
    expect(screen.current).toEqual({ turn: REPLY, ok: false });
  });

  test("취소 · 되돌리기 대기 · 진행 중 알림과 다른 계정의 알림은 아무것도 띄우지 않는다", () => {
    const screen = autosaveScreen();
    screen.handOff();
    for (const phase of ["checking", "writing", "undoing", "cancelled", "undo_pending"]) {
      screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase });
    }
    screen.emit({ ownerId: "other-owner", reply: REPLY, sourceId: "job-2", phase: "kept" });
    screen.emit({ ownerId: "other-owner", reply: REPLY, sourceId: "job-3", phase: "failed" });
    screen.emit({ ownerId: "other-owner", reply: REPLY, sourceId: "job-4", phase: "undo_unrecorded" });
    expect({ kept: screen.kept.has(REPLY), notice: screen.notice, announced: screen.announced }).toEqual({
      kept: false,
      notice: [],
      announced: [],
    });
    expect(screen.renders).toBe(5); // 칩이 단계를 다시 읽도록 이 계정의 알림마다 다시 그린다
  });

  test("자동으로 담긴 대화도 담긴 뒤에 위기 분류를 돌린다 (C9)", () => {
    const screen = autosaveScreen("red");
    screen.handOff();
    expect(screen.crisis).toEqual([]);
    screen.emit({ ownerId: "local-owner", reply: REPLY, sourceId: "job-1", phase: "kept" });
    expect(screen.crisis).toEqual([{ visible: true, hotline: "KR_109" }]);
  });
});

describe("실패 안내가 보이는 자리에 온다", () => {
  // 브라우저 실측에서 잡힌 것: 안내는 대화 스크롤의 끝에 그려지는데 자동
  // 스크롤이 [turns] 에만 걸려 있어서, 담기가 실패해도 스크롤이 내려가지 않고
  // 안내가 스크롤 클립 아래로 잘렸다. 320/390/1440 에서 표본 5점 중 4~5점이
  // 스크롤 밖이었다. 안내를 읽어 주기는 했지만 눈으로 보는 사용자는 아무것도
  // 못 읽었다. "뷰포트 안에 있다"와 "스크롤 컨테이너 안에 보인다"는 다르다.
  function scrollEffectDeps(): string {
    const effect = findEffect("scrollToEnd");
    const deps = effect.match(/\}\s*,\s*(\[[^\]]*\])\s*\)\s*;?\s*$/);
    if (!deps) throw new Error("자동 스크롤 useEffect 의 의존성 배열을 찾지 못했다");
    return deps[1];
  }

  test("새 턴이 오면 바닥으로 스크롤한다", () => {
    expect(scrollEffectDeps()).toContain("turns");
  });

  test("담기 실패 안내가 뜨면 그것도 바닥으로 스크롤한다", () => {
    expect(scrollEffectDeps()).toContain("keepNotice");
  });
});

describe("실패 안내가 화면에 붙어 있고 문구가 정직하다", () => {
  test("담기 칩 옆에 live region 으로 실패 캡션을 그린다", () => {
    // 복사 캡션과 같은 자세여야 한다: 같은 턴 옆에서, 자동으로 읽히게.
    const render = SOURCE.slice(SOURCE.indexOf("isKeepable(turn) ?"));
    expect(render).toContain("keepNotice");
    expect(render.slice(0, render.indexOf("</Pressable>") + 400)).toMatch(/accessibilityLiveRegion="polite"/);
    expect(SOURCE).toContain('t("keepFailed")');
  });

  test("다섯 로케일 모두 keepFailed 를 가진다", () => {
    for (const code of LOCALES) {
      const value = localeJson(code).keepFailed;
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(8);
    }
  });

  test("베타 로케일 값이 영어 그대로가 아니다", () => {
    const en = localeJson("en").keepFailed as string;
    for (const code of ["es", "pt", "id"] as const) {
      expect(localeJson(code).keepFailed).not.toBe(en);
    }
  });

  test("담기지 않았다고 단정하지 않는다", () => {
    // Round21 과 같은 규율: 실패한 쓰기의 결과를 우리가 알 수 없다. "아무것도
    // 저장되지 않았다"고 말하면 사용자가 잃은 것을 확인하지 않고 넘어간다.
    const ko = localeJson("ko").keepFailed as string;
    const en = localeJson("en").keepFailed as string;
    expect(ko).not.toMatch(/저장되지 않았|담기지 않았|아무것도/);
    expect(en).not.toMatch(/nothing was|was not saved|not kept/i);
    expect(ko).toMatch(/확인/);
    expect(en).toMatch(/check/i);
  });

  test("이 저장소의 한국어 관용을 따른다", () => {
    // 서술은 습니다, 명령은 주세요. 명령형 "주세요"는 해요체가 아니라 이
    // 저장소의 정상 형태이므로 금지하지 않는다.
    //
    // locales/ko 전체를 문장 단위로 세어 봤다(명령형 제외, 종결형만):
    //   main 4038300d  서술 습니다 1370 · 서술 해요   21 · 명령 세요 249
    //   TTL 작업본      서술 습니다  118 · 서술 해요 1119 · 명령 세요 383
    // main 은 섞여 있는 것이 아니라 거의 한 말투이고, TTL 이 뒤집힌 쪽이다.
    // 문구가 착지할 곳은 main 이므로 눈앞의 워크트리가 아니라 main 을 따른다.
    // 옆자리 선례도 같다: copyFailed = "복사하지 못했습니다. ... 복사해 주세요."
    //
    // ⚠ 이 가드를 로케일 전체로 넓히지 말 것. locales/ko/consent.json 의
    // "위급할 때는 112·119에 직접 연락하십시오." 는 격식체가 의도된 응급
    // 안내이고 문체 작업의 보호 대상이다. 여기서는 이 키 하나만 본다.
    const ko = localeJson("ko").keepFailed as string;
    expect(ko).toMatch(/니다\./);
    expect(ko).not.toMatch(/했어요|해요\.|어요\./);
    expect(ko).not.toMatch(/십시오/);
  });

  test("있는 버튼 이름을 부른다", () => {
    // 처음에 EN 문구가 워크트리 라벨("Save to wiki")을 불렀는데 main 의 라벨은
    // "Keep to wiki" 였다. 착지 대상이 아니라 눈앞의 워크트리를 기준으로 삼으면
    // 사용자에게 없는 버튼을 누르라고 하게 된다.
    //
    // EN 만 리터럴을 박았다. 이유는 파일 값 읽기가 약해서가 아니다 - 오히려
    // 더 강하다. 네 경우를 실제로 돌려 봤다:
    //                          지금    개명(Keep->Save) 착지 후
    //   파일 값 읽기            FAIL          FAIL      <- 시끄럽게 깨진다
    //   "Keep to wiki" 리터럴   PASS          PASS      <- 갈렸는데 초록이다
    // 리터럴 쪽이 개명 뒤에도 초록으로 남는 것이 약점이다. 그런데도 지금
    // 리터럴인 이유는 하나뿐이다: 이 워크트리의 en.keepToWiki 가 아직
    // "Save to wiki"(Q-260907-B 에 묶인 미착지 라운드)라서 파일 값을 읽으면
    // 오늘 당장 빨갛고, 매일 무시해야 하는 빨간 테스트는 얼어붙은 리터럴보다
    // 나쁘다. es/pt/id 는 워크트리와 main 이 같아 파일 값을 읽는다 - 그쪽이
    // 더 강한 형태다.
    // TODO(Q-260907-B): 그 라운드의 처분이 나면 EN 도 파일 값 읽기로 바꾼다.
    expect(localeJson("en").keepFailed).toContain("Keep to wiki");
    expect(localeJson("es").keepFailed).toContain(localeJson("es").keepToWiki as string);
    expect(localeJson("pt").keepFailed).toContain(localeJson("pt").keepToWiki as string);
    expect(localeJson("id").keepFailed).toContain(localeJson("id").keepToWiki as string);
  });

  test("인도네시아어는 이 파일의 비격식 인칭을 따른다", () => {
    // locales/id/secondb.json 실측: Anda 0 · kamu/-mu 43. 격식 인칭을 새로
    // 들여오면 이 화면 안에서만 말투가 갈린다.
    const id = localeJson("id").keepFailed as string;
    expect(id).not.toMatch(/\bAnda\b/);
  });

  test("금지된 표현이 없다", () => {
    for (const code of LOCALES) {
      const value = localeJson(code).keepFailed as string;
      expect(value).not.toContain("—");
      expect(value).not.toMatch(/치유|심리치료|therapy|diagnosis/i);
    }
  });
});

describe("철회한 저장을 아직 삭제하지 못했다는 안내 (게이트 r260919 DA-1814-2 · 재게이트 GA-1814-2 · GZ-1814-5)", () => {
  // 되돌리기가 원격 삭제에도 기기 기록에도 실패했을 때만 뜬다. 그때 사용자에게 남은 사실은 셋이다: ① 아직 삭제되지
  // 않았다 ② 앱이 켜져 있는 동안 대화 화면으로 돌아오면(대화 화면을 다시 열면 · 대화 화면이 떠 있는 동안 앱이 앞으로 오면)
  // 다시 지워 본다 ③ 행이 남아 있으면 위키(/records)에서 그 기록을 열어 직접 지울 수 있다. 담기 실패 안내를 빌려 쓰지 않는다 -
  // 그 뒷절 "다시 담아 주세요" 는 지우길 원한 사용자에게 반대로 말한다.
  //
  // 재게이트가 ②를 바로잡았다: 다시 지울 단서는 이 런타임의 메모리에만 있고(기기에 못 적었으니 이 안내가 뜬다) 비우기는 대화
  // 화면이 부른다. 전에는 "앱으로 돌아오면" 이라고만 해서 앱을 다시 시작해도, 다른 화면으로 돌아와도 되는 것처럼 읽혔다.
  // ③의 화면 이름도 바로잡았다: 배송 화면의 제목과 독 탭은 records.wikiTitle(위키)이고, 예전에 부르던 records.title(기록
  // 보관소)은 배송 코드 어디에도 그려지지 않는다.
  const text = (code: string): string => localeJson(code).chatSaveNotDeleted as string;
  const deepspaceJson = (code: string): { records: { title: string; wikiTitle: string } } =>
    JSON.parse(readFileSync(resolve(__dirname, "../../../locales", code, "deepspace.json"), "utf8")) as {
      records: { title: string; wikiTitle: string };
    };
  const recordsTitle = (code: string): string => deepspaceJson(code).records.wikiTitle;

  test("담기 칩 옆 같은 자리에 그린다 - 어느 문구인지는 알림이 정한다", () => {
    const render = SOURCE.slice(SOURCE.indexOf("isKeepable(turn) ?"));
    expect(render).toContain('t(keepNotice.notDeleted ? "chatSaveNotDeleted" : "keepFailed")');
  });

  test("다섯 로케일 모두 가지고, 베타 로케일 값이 영어 그대로가 아니다", () => {
    for (const code of LOCALES) expect(text(code).length).toBeGreaterThan(20);
    for (const code of ["es", "pt", "id"] as const) expect(text(code)).not.toBe(text("en"));
  });

  test("사실만 말한다: 삭제됐다고 하지 않고, 다시 지워 본다고 하고, 직접 지울 곳을 실제 화면 이름으로 부른다", () => {
    for (const code of LOCALES) expect(text(code)).toContain(recordsTitle(code));
    expect(text("en")).toMatch(/isn't deleted yet/);
    expect(text("en")).toMatch(/try again/);
    expect(text("en")).not.toMatch(/was deleted|has been deleted|keep to wiki|save to wiki/i);
    expect(text("ko")).toMatch(/아직 삭제하지 못했어요/);
    expect(text("ko")).toMatch(/다시 삭제해 볼게요/);
    expect(text("ko")).not.toMatch(/담아|삭제했어요|삭제됐어요/);
  });

  test("부르는 화면 이름은 배송 화면이 실제로 그리는 제목이다 - 그려지지 않는 옛 이름(기록 보관소)을 부르지 않는다", () => {
    const screen = readFileSync(resolve(__dirname, "../../screens/deepspace/dds-wiki-records-screens.tsx"), "utf8");
    expect(screen).toContain('t("records.wikiTitle")');
    for (const code of LOCALES) {
      const { title, wikiTitle } = deepspaceJson(code).records;
      if (title !== wikiTitle) expect(text(code)).not.toContain(title);
    }
  });

  test("다시 지워 보는 조건을 실제대로 말한다: 앱이 켜져 있는 동안, 대화 화면으로 돌아올 때 (재게이트 GA-1814-2 · GZ-1814-5)", () => {
    expect(text("en")).toMatch(/While the app is open/);
    expect(text("en")).toMatch(/come back to this chat/);
    expect(text("en")).not.toMatch(/when you return to the app/);
    expect(text("ko")).toMatch(/앱이 켜져 있는 동안/);
    expect(text("ko")).toMatch(/대화 화면으로 돌아올 때마다/);
    expect(text("ko")).not.toMatch(/앱으로 돌아오면/);
    // 베타 로케일은 옛 약속(앱으로 돌아오면 = 재시작 뒤에도)을 남기지 않는다
    expect(text("es")).not.toMatch(/cuando vuelvas a la app/);
    expect(text("pt")).not.toMatch(/quando você voltar ao app/);
    expect(text("id")).not.toMatch(/saat kamu kembali ke aplikasi/);
    // 그 조건은 코드와 같다: 비우기는 대화 화면이 부르고(뜰 때 · 앱이 앞으로 올 때), 다시 지울 단서는 이 런타임이 쥔다
    expect(SOURCE).toContain("void drainAutosaveUndoQueue(ownerId)");
    expect(SOURCE).toContain('if (state === "active") drain();');
  });

  test("한국어는 해요체다", () => {
    const sentences = text("ko").split(/(?<=\.)\s+/);
    expect(sentences.length).toBe(3);
    for (const sentence of sentences) expect(sentence).toMatch(/요\.$/);
    expect(text("ko")).not.toMatch(/니다\.|십시오/);
  });

  test("인도네시아어는 비격식 인칭이고, 금지된 표현이 없다", () => {
    expect(text("id")).not.toMatch(/\bAnda\b/);
    for (const code of LOCALES) {
      expect(text(code)).not.toContain("—");
      expect(text(code)).not.toMatch(/치유|심리치료|therapy|diagnosis/i);
    }
  });
});

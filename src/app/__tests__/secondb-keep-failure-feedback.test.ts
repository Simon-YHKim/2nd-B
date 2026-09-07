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
// (keepExchange 함수와 자동 담기 useEffect)만 AST 로 떼어 실행한다. 재구현이
// 아니라 실제 본문이고, 저장/인증/모델 경계는 하나도 로드되지 않는다.
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

interface Host {
  keep: (index: number) => Promise<unknown>;
  state: {
    kept: Set<number>;
    keeping: (number | null)[];
    notice: unknown[];
    announced: string[];
    crisis: unknown[];
    captures: unknown[];
    warnings: string[];
    current: unknown;
  };
}

/** 실제 keepExchange 본문을 inert 호스트에 걸고 관측 가능한 상태를 돌려준다. */
function keepHost(options: { capture?: () => Promise<unknown>; kept?: Set<number>; keeping?: number | null; notice?: unknown } = {}): Host {
  const state: Host["state"] = { kept: new Set(options.kept ?? []), keeping: [], notice: [], announced: [], crisis: [], captures: [], warnings: [], current: options.notice ?? null };
  const bindings = {
    userId: "local-owner",
    keeping: options.keeping ?? null,
    keptIdx: state.kept,
    turns: [PROMPT, REPLY, PROMPT, REPLY],
    isKeepable: (turn: { role: string }) => turn.role === "secondb",
    setKeeping: (value: number | null) => state.keeping.push(value),
    setKeptIdx: (fn: (prev: Set<number>) => Set<number>) => { state.kept = fn(state.kept); },
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
    classifyInput: () => ({ zone: "green" }),
    isMinor: false,
    captureFromMarkdown: async (payload: unknown) => {
      state.captures.push(payload);
      if (options.capture) return options.capture();
      return { id: "clip-1" };
    },
    AccessibilityInfo: { announceForAccessibility: (msg: string) => state.announced.push(msg) },
    console: { warn: (...args: unknown[]) => state.warnings.push(args.join(" ")) },
  };
  const keep = run<Host["keep"]>(findFunction("keepExchange"), "return keepExchange;", bindings);
  return { keep, state };
}

describe("담기 실패를 화면이 말한다", () => {
  test("성공하면 담긴 것으로 표시하고 실패 안내는 띄우지 않는다", async () => {
    const host = keepHost();
    await host.keep(1);
    expect(host.state.captures).toHaveLength(1);
    expect(host.state.kept.has(1)).toBe(true);
    expect(host.state.notice.filter(Boolean)).toEqual([]);
    expect(host.state.warnings).toEqual([]);
  });

  test("실패하면 담긴 것으로 표시하지 않는다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    expect(host.state.kept.has(1)).toBe(false);
    expect(host.state.keeping.at(-1)).toBeNull();
  });

  test("실패를 화면 상태로 알린다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    const notices = host.state.notice.filter(Boolean) as { i: number; ok: boolean }[];
    expect(notices).toHaveLength(1);
    expect(notices[0].i).toBe(1);
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
    const host = keepHost({ notice: { i: 1, ok: false } });
    await host.keep(3);
    expect(host.state.kept.has(3)).toBe(true);
    expect(host.state.current).toEqual({ i: 1, ok: false });
  });

  test("성공 여부를 호출자에게 돌려준다", async () => {
    await expect(keepHost().keep(1)).resolves.toBe(true);
    await expect(keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) }).keep(1)).resolves.toBe(false);
  });

  test("이미 담겼거나 처리 중이면 아무 일도 하지 않는다", async () => {
    const already = keepHost({ kept: new Set([1]) });
    await already.keep(1);
    expect(already.state.captures).toEqual([]);
    const busy = keepHost({ keeping: 0 });
    await busy.keep(1);
    expect(busy.state.captures).toEqual([]);
  });

  test("위기 분류는 실제로 담긴 뒤에만 돈다", async () => {
    const host = keepHost({ capture: () => Promise.reject(new Error("Local capture failure")) });
    await host.keep(1);
    expect(host.state.crisis).toEqual([]);
  });
});

describe("자동 담기는 실패를 삼키지 않는다", () => {
  function autosaveHost(ok: boolean) {
    const ref = { current: new Set<number>() };
    const calls: number[] = [];
    const bindings = {
      useEffect: (fn: () => void) => { fn(); },
      chatAutosaveAllowed: () => true,
      autosaveConsent: { chat_autosave: true },
      userId: "local-owner",
      keeping: null,
      turns: [PROMPT, REPLY],
      isKeepable: (turn: { role: string }) => turn.role === "secondb",
      autoKeptRef: ref,
      keptIdx: new Set<number>(),
      keepExchange: async (index: number) => { calls.push(index); return ok; },
    };
    run(findEffect("autoKeptRef"), "", bindings);
    return { ref, calls };
  }

  test("동의가 켜져 있으면 마지막 담을 수 있는 턴을 한 번 담는다", async () => {
    const host = autosaveHost(true);
    await Promise.resolve();
    expect(host.calls).toEqual([1]);
  });

  test("성공하면 다시 담지 않도록 표시가 남는다", async () => {
    const host = autosaveHost(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(host.ref.current.has(1)).toBe(true);
  });

  test("실패하면 표시를 되돌려 다시 담을 수 있게 한다", async () => {
    const host = autosaveHost(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(host.ref.current.has(1)).toBe(false);
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

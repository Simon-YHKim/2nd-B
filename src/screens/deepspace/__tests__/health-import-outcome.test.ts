import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// 건강 데이터를 가져왔는데 무엇이 들어갔는지 말하지 않는다.
//
// ⚠ 이 함수 바로 위에 **HONESTY INVARIANT** 가 적혀 있다:
//
//   "if the real health source is missing or the user denies the OS permission,
//    we write NOTHING and say so. This used to silently fall back to
//    mockSamplesForRange() ... and then report success. ... A user who denied
//    permission got a brighter 건강 star built from data they never produced.
//    That is the exact opposite of 정직한 밝기, the invariant this whole product
//    rests on."
//
// 그 불변식이 지키는 것은 **읽기** 단계다. 45줄 뒤 **쓰기** 단계에서는:
//
//   await ingestHealthSamples(userId, samples, { … });   // IngestResult 를 버린다
//   setHealthDone(true);                                  // 무조건 "반영됨"
//
// 버려지는 결과에 둘이 들어 있다:
//   inserted        실제로 들어간 행. upsert 가 멱등이라 같은 구간을 다시 가져오면 0 이다.
//   autoCompleted   이 가져오기로 **자동 완료된 루틴 id**. 저장소 전체에서 읽는 곳이 0건이었다.
//
// 그래서 30개를 읽어 0개가 들어가도 화면은 "반영됨" 이고, 걸음 수를 가져왔더니
// "오늘 산책" 루틴이 체크돼 있어도 아무 신호가 없다. 자동 완료 **자체는 의도된
// 기능**이고 결함은 **말하지 않는 것**이다.
//
// 같은 파일이 읽기 쪽 0 에는 문구를 갖고 있다(healthErrEmpty, 주석까지 달려 있다:
// "Nothing to reflect is not a failure, but it is not 'reflected' either").
// 쓰기 쪽 0 에는 없었다.
//
// 화면을 렌더하지 않고 실제 함수 선언을 AST 로 떼어 inert 컨텍스트에서 돌린다.
const FILE = "src/screens/deepspace/dds-import-inbox-screens.tsx";
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function handler(context: Record<string, unknown>) {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text = "";
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleHealthIngest") text = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!text) throw new Error("handleHealthIngest 선언을 찾지 못했다");
  const js = ts.transpileModule(`${text}\nconst run = handleHealthIngest;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as () => Promise<void>;
}

interface Options {
  read?: number;
  inserted?: number;
  autoCompleted?: number;
  permission?: string;
  noSource?: boolean;
  ingestThrows?: boolean;
}

function harness(options: Options = {}) {
  const read = options.read ?? 3;
  const calls = {
    done: [] as unknown[],
    err: [] as unknown[],
    tKeys: [] as string[],
    tArgs: [] as unknown[],
  };
  const context: Record<string, unknown> = {
    userId: "user-a", healthBusy: false, canHealth: true, isMinor: false, healthPref: true,
    setHealthBusy: () => undefined,
    setHealthDone: (value: unknown) => { calls.done.push(value); },
    setHealthErr: (value: unknown) => { calls.err.push(value); },
    // The real screen's t() returns a rendered string; here it returns the key so
    // assertions read as "which message did the user get", plus the interpolation.
    t: (key: string, args?: unknown) => {
      calls.tKeys.push(key);
      if (args !== undefined) calls.tArgs.push({ key, args });
      return args === undefined ? key : `${key}|${JSON.stringify(args)}`;
    },
    availableHealthSources: () => options.noSource ? [] : [{
      id: "health_connect",
      requestPermission: async () => options.permission ?? "granted",
      read: async () => Array.from({ length: read }, (_, i) => ({ metricType: "steps", value: i })),
    }],
    ingestHealthSamples: async () => {
      if (options.ingestThrows) throw new Error("gate rejected");
      return {
        inserted: Array.from({ length: options.inserted ?? read }, (_, i) => ({ id: `r${i}` })),
        autoCompleted: Array.from({ length: options.autoCompleted ?? 0 }, (_, i) => `routine-${i}`),
      };
    },
  };
  return { run: handler(context), calls };
}

const bundle = (code: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "locales", code, "deepspace.json"), "utf8"))
    .ds.import as Record<string, string>;

// 문구 조립은 렌더가 한다(로케일이 바뀌면 다시 그려져야 하므로 만들어진 문자열을
// 상태에 넣지 않는다). 그래서 핸들러 검사는 **상태에 무엇이 실렸나**를 보고,
// 렌더 쪽은 아래 "문구" describe 에서 소스로 확인한다.
const outcome = (screen: ReturnType<typeof harness>) => screen.calls.done.at(-1) as
  { kind: string; inserted?: number; autoCompleted?: number } | null;

test("들어간 개수를 상태에 싣는다", async () => {
  const screen = harness({ read: 12, inserted: 12, autoCompleted: 0 });
  await screen.run();
  expect(outcome(screen)).toMatchObject({ kind: "reflected", inserted: 12 });
});

test("읽었는데 새로 들어간 것이 0이면 '반영됨' 으로 끝내지 않는다", async () => {
  // upsert 가 멱등이라 같은 구간 재가져오기는 여기로 온다. 읽기 쪽 0 에는 문구가
  // 있는데(healthErrEmpty) 쓰기 쪽 0 에는 없었다.
  const screen = harness({ read: 9, inserted: 0 });
  await screen.run();
  expect(outcome(screen)).toMatchObject({ kind: "nothingNew" });
});

test("자동 완료된 루틴 수를 상태에 싣는다", async () => {
  // 걸음 수를 가져왔더니 '오늘 산책' 루틴이 체크된다. 지금까지 아무 신호가 없었다.
  const screen = harness({ read: 5, inserted: 5, autoCompleted: 2 });
  await screen.run();
  expect(outcome(screen)).toMatchObject({ kind: "reflected", inserted: 5, autoCompleted: 2 });
});

test("읽기 쪽 0 은 지금까지처럼 healthErrEmpty 다 - 두 개의 0 을 섞지 않는다", async () => {
  const screen = harness({ read: 0 });
  await screen.run();
  expect(screen.calls.tKeys).toContain("ds.import.healthErrEmpty");
  expect(screen.calls.tKeys).not.toContain("ds.import.healthReflectedNone");
});

test("권한 거부·소스 없음·던져진 실패는 지금까지 그대로다", async () => {
  const denied = harness({ permission: "denied" });
  await denied.run();
  expect(denied.calls.tKeys).toContain("ds.import.healthErrDenied");

  const none = harness({ noSource: true });
  await none.run();
  expect(none.calls.tKeys).toContain("ds.import.healthErrUnavailable");

  const threw = harness({ ingestThrows: true });
  await threw.run();
  expect(threw.calls.tKeys).toContain("ds.import.healthErrFailed");
});

describe("문구", () => {
  test("새 키가 5개 로케일에 다 있다", () => {
    for (const code of LOCALES) {
      const copy = bundle(code);
      for (const key of ["healthReflected", "healthReflectedNone", "healthRoutinesCompleted"]) {
        expect(typeof copy[key]).toBe("string");
        expect(copy[key].trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("수를 명사에 붙이지 않는다 - 이 저장소는 복수형 키가 0개다", () => {
    // {{count}} 뒤에 바로 라틴 문자가 오면 개수가 1일 때 "1 items" 가 나온다.
    for (const code of LOCALES) {
      const copy = bundle(code);
      for (const key of ["healthReflected", "healthRoutinesCompleted"]) {
        expect(copy[key]).toContain("{{count}}");
        expect(copy[key]).not.toMatch(/\{\{count\}\}\s+[A-Za-z]/);
      }
    }
  });

  test("읽기 쪽 0 문구는 그대로 남는다", () => {
    expect(bundle("en").healthErrEmpty).toMatch(/no health activity/i);
  });

  test("렌더가 세 문구를 쓰고, 루틴 줄은 0 보다 클 때만 나온다", () => {
    const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
    expect(source).toContain("ds.import.healthReflected");
    expect(source).toContain("ds.import.healthReflectedNone");
    expect(source).toContain("ds.import.healthRoutinesCompleted");
    // 상시 노이즈 금지: 자동 완료가 0이면 그 줄을 안 그린다.
    expect(source).toMatch(/autoCompleted\s*>\s*0/);
  });
});

// 프로필 자동 재확인에 총량 상한이 있는가 (vibe r260914 R3-A 생성물 게이트 발견, medium).
//
// /interview 는 첫 프로브가 실패한 동안 2초에서 30초 상한까지 늘리며 refresh() 를 성공할
// 때까지 끝없이 불렀다. refresh() 안의 "시계 차이 재시도 최대 2회"(profile-probe.ts)를 그
// 바깥 루프가 매번 새로 시작해서, 단위 테스트는 3회를 말했지만 화면을 한 시간 열어 두면
// 비시계 오류로 약 120번, 시계 차이면 그때마다 최대 3번씩 물었다.
//
// 고친 모양: 화면은 스스로 다시 묻지 않는다. 자동 재시도는 AuthContext 의 한도 재시도
// (probeWithClockSkewRetry) 하나가 오류 종류와 총 시도 수를 함께 갖고, 그 뒤는 사람이 누르는
// 다시 시도(ProfileProbeRetryPanel)다. 그래서 여기서는 (1) 한 번의 확인이 가짜 시계로 한 시간을
// 돌려도 한도 안에서 끝나는지, (2) /interview 와 배송 코드 어디에도 그 한도를 다시 시작하는
// 루프가 없는지를 본다. 컴포넌트 렌더 테스트가 막혀 있어(RN 0.85 upstream) (2)는 AST 로 본다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import * as ts from "typescript";

import {
  CLOCK_SKEW_RETRY_DELAYS_MS,
  probeWithClockSkewRetry,
  type ProfileProbe,
  type ProfileProbeAttempt,
} from "../../lib/auth/profile-probe";

const ROOT = process.cwd();
const HOUR_MS = 60 * 60 * 1000;
const FAILED: ProfileProbe = { hasProfile: false, isMinor: null, age: null, probeFailed: true };

describe("한 번의 프로필 확인 - 가짜 시계로 한 시간을 돌려도 한도 안에서 끝난다", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  async function runForAnHour(attempt: () => Promise<ProfileProbeAttempt>): Promise<ProfileProbe | undefined> {
    let result: ProfileProbe | undefined;
    const run = probeWithClockSkewRetry({ attempt, isCurrent: () => true }).then((probe) => {
      result = probe;
    });
    await jest.advanceTimersByTimeAsync(HOUR_MS);
    await run;
    return result;
  }

  test("시계 차이가 계속되면 첫 시도 + 재시도 2회로 끝나고 타이머를 남기지 않는다", async () => {
    const attempt = jest.fn(async (): Promise<ProfileProbeAttempt> => ({ probe: FAILED, clockSkew: true }));
    expect(await runForAnHour(attempt)).toBe(FAILED);
    expect(CLOCK_SKEW_RETRY_DELAYS_MS).toHaveLength(2);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("네트워크 · DNS · 타임아웃 같은 다른 실패는 한 번 묻고 끝난다", async () => {
    const attempt = jest.fn(async (): Promise<ProfileProbeAttempt> => ({ probe: FAILED, clockSkew: false }));
    expect(await runForAnHour(attempt)).toBe(FAILED);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "__mocks__") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

/** node 안에 `name(...)` 또는 `x.name(...)` 호출이 있는가. */
function callsNamed(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(candidate)) {
      const callee = candidate.expression;
      if (
        (ts.isIdentifier(callee) && callee.text === name) ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === name)
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function timerCallbacks(node: ts.Node, timer: "setTimeout" | "setInterval"): ts.Expression[] {
  const callbacks: ts.Expression[] = [];
  const visit = (candidate: ts.Node): void => {
    if (
      ts.isCallExpression(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === timer &&
      candidate.arguments.length > 0
    ) {
      callbacks.push(candidate.arguments[0]);
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return callbacks;
}

/**
 * 끝없는 refresh() 루프: setInterval 콜백이 refresh() 를 부르거나, 이름 있는 함수가 예약한
 * setTimeout 콜백이 refresh() 와 그 함수 자신을 둘 다 부른다(자기 재예약). 한 번만 예약하는
 * 지연 재확인(`setTimeout(() => void refresh(), 2000)`)은 끝이 있어서 세지 않는다.
 */
function unboundedRefreshLoops(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const loops: string[] = [];
  const at = (node: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "setInterval") {
      const callback = node.arguments[0];
      if (callback && callsNamed(callback, "refresh")) loops.push(`${at(node)} setInterval`);
    }
    let name: string | undefined;
    let body: ts.Node | undefined;
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      name = node.name.text;
      body = node.body;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
      body = node.initializer.body;
    }
    if (name && body) {
      for (const callback of timerCallbacks(body, "setTimeout")) {
        if (callsNamed(callback, "refresh") && callsNamed(callback, name)) loops.push(`${at(callback)} ${name}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return loops;
}

describe("프로필 재확인 루프 판정기 자체", () => {
  test("원래 /interview 의 백오프 루프를 잡는다", () => {
    const loop = `
      function Screen() {
        useEffect(() => {
          let retryDelayMs = 2000;
          const scheduleRetry = () => {
            timer = setTimeout(() => {
              void refresh().catch(() => undefined).finally(() => {
                retryDelayMs = Math.min(retryDelayMs * 2, 30000);
                scheduleRetry();
              });
            }, retryDelayMs);
          };
          scheduleRetry();
        }, []);
      }`;
    expect(unboundedRefreshLoops("fixture.tsx", loop)).toHaveLength(1);
    expect(unboundedRefreshLoops("fixture.tsx", "const poll = () => setInterval(() => void refresh(), 30000);")).toHaveLength(1);
  });

  test("한 번 예약하는 지연 재확인은 세지 않는다", () => {
    const once = `
      function Screen() {
        useEffect(() => {
          const timer = setTimeout(() => void refresh(), 2000);
          return () => clearTimeout(timer);
        }, []);
      }`;
    expect(unboundedRefreshLoops("fixture.tsx", once)).toEqual([]);
  });
});

describe("화면이 한도 재시도를 다시 시작하지 않는다", () => {
  test("/interview 는 refresh 를 쓰지 않는다 - 자동은 AuthContext 의 한도, 그 뒤는 다시 시도 버튼", () => {
    const interview = readFileSync(join(ROOT, "src/app/interview.tsx"), "utf8");
    const sf = ts.createSourceFile("interview.tsx", interview, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const refs: number[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text === "refresh") refs.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(refs).toEqual([]);
  });

  test("src 어디에도 끝없는 refresh() 루프가 없다", () => {
    const files = ["src/app", "src/screens", "src/components", "src/lib"].flatMap((dir) => sourceFiles(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(500);
    const loops = files.flatMap((file) => unboundedRefreshLoops(file, readFileSync(join(ROOT, file), "utf8")));
    expect(loops).toEqual([]);
  });
});

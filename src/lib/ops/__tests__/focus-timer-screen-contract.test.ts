// The focus timer's effect lives in a screen, and render tests are blocked in this repo. The
// order of events is run in focus-clock.test.ts against the run itself (lib/ops/focus-clock);
// this reads the screen's source and pins how the screen is wired to that run.
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

const FILE = path.join(__dirname, "../../../screens/deepspace/DeepSpaceDesignScreens.tsx");
const source = ts.createSourceFile(FILE, fs.readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function focusScreen(): ts.FunctionDeclaration {
  let found: ts.FunctionDeclaration | undefined;
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "DeepSpaceFocusScreen") found = node;
  });
  if (!found) throw new Error("DeepSpaceFocusScreen not found");
  return found;
}

const code = (text: string) => text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

function effects(): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect") {
      found.push(code(node.getText(source)));
    }
    node.forEachChild(visit);
  };
  visit(focusScreen());
  return found;
}

describe("the focus screen's timer wiring (Z109)", () => {
  const screen = code(focusScreen().getText(source));
  const withInterval = effects().filter((text) => /\bsetInterval\(/.test(text));
  const effect = withInterval[0] ?? "";

  test("one effect owns the interval, and a new run starts whenever the mark moves", () => {
    expect(withInterval).toHaveLength(1);
    expect(effect).toMatch(/\}, \[timer\.running, runMark, userId, t\]\)$/);
  });

  test("the run measures by the clocks; the screen counts nothing itself", () => {
    expect(effect).toMatch(/const run = startFocusRun\(timerRef\.current, AppState\.currentState === "active", \{ read: readFocusClock,/);
    expect(effect).toMatch(/const id = setInterval\(run\.step, 1000\);/);
    expect(effect).toMatch(/AppState\.addEventListener\("change", \(state\) => run\.appInFront\(state === "active"\)\)/);
    expect(screen).not.toMatch(/\btick\(/);
    expect(screen).not.toMatch(/advanceByClock\(/);
  });

  test("the run owns the timer only while the mark it started under is the current one", () => {
    expect(effect).toMatch(/owns: \(\) => runMarkRef\.current === runMark,/);
  });

  test("every press that changes the timer moves the mark first, then the state", () => {
    expect(screen).toMatch(
      /const changeTimer = \(update: \(state: PomodoroState\) => PomodoroState\) => \{ runMarkRef\.current \+= 1; setRunMark\(runMarkRef\.current\); setTimer\(update\); \};/,
    );
    expect(screen).toMatch(/onPress=\{\(\) => changeTimer\(\(s\) => \(s\.running \? pause\(s\) : start\(s\)\)\)\}/);
    expect(screen).toMatch(/onPress=\{\(\) => changeTimer\(\(s\) => reset\(s\)\)\}/);
    expect(screen).toMatch(/changeTimer\(\(\) => createPomodoro\(\{ \.\.\.timer\.config, focusMinutes: m \}\)\);/);
    // No other writer: the helper, and the two things the run reports.
    expect((screen.match(/\bsetTimer\(/g) ?? []).length).toBe(3);
  });

  test("what the run reports goes to the ref before React, so a new run starts from it", () => {
    expect(effect).toMatch(/onAdvance: \(next\) => \{ timerRef\.current = next; setTimer\(next\); \},/);
    expect(effect).toMatch(/onComplete: \(finished\) => \{ const idle = createPomodoro\(finished\.config\); timerRef\.current = idle; setTimer\(idle\);/);
  });

  test("the end is announced every time it is reported, account first", () => {
    expect(effect).toMatch(
      /if \(userId\) \{ void applyFocusSessionComplete\(userId\)\.catch\(\(\) => \{\}\); void notifyNow\(userId, t\("focus\.alarmFocusTitle"\)/,
    );
    expect((effect.match(/notifyNow\(/g) ?? []).length).toBe(1);
    expect(effect).toMatch(/completeFocusSession\(cur\.day, doneArea, finished\.config\.focusMinutes\)/);
  });

  test("the screen lets go of the run when the effect ends", () => {
    expect(effect).toMatch(/return \(\) => \{ run\.close\(\); clearInterval\(id\); sub\.remove\(\); \};/);
  });

  test("this change hands nothing to the OS: no scheduled alert to ring twice or to be left behind", () => {
    expect(screen).not.toMatch(/scheduleFocusEnd|cancelFocusEnd|createFocusEndAlert/);
  });
});

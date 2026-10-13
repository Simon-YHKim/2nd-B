// The focus timer's effect lives in a screen, and render tests are blocked in this repo, so this
// reads the source. It pins what made the timer stop in the background (Z109) and what the first
// review of the fix found: the session's own state and the closed flag.
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

describe("the focus screen's timer effect (Z109)", () => {
  const withInterval = effects().filter((text) => /\bsetInterval\(/.test(text));
  const effect = withInterval[0] ?? "";

  test("one effect owns the interval", () => {
    expect(withInterval).toHaveLength(1);
    expect(effect).toMatch(/\}, \[timer\.running, userId, t\]\)$/);
  });

  test("advances by the clocks, never by a counted second", () => {
    expect(effect).toMatch(/const at = readFocusClock\(\);/);
    expect(effect).toMatch(/advanceByClock\(current, since, at, continuous\)/);
    expect(effect).toMatch(/since = at; continuous = true;/);
    expect(effect).not.toMatch(/\btick\(/);
    expect(code(focusScreen().getText(source))).not.toMatch(/\btick\([^)]*,\s*1000\)/);
  });

  test("each call starts from what the call before it left, not from a timer one render old", () => {
    // The tick and the return to the front can both call advance() before React renders.
    expect(effect).toMatch(/let current = timerRef\.current;/);
    expect(effect).toMatch(/const prev = current; current = next; timerRef\.current = next;/);
    // advance() itself never reads the ref back.
    const advance = effect.slice(effect.indexOf("const advance = () => {"), effect.indexOf("const id = setInterval(advance, 1000);"));
    expect(advance.length).toBeGreaterThan(200);
    expect(advance).not.toMatch(/=\s*timerRef\.current/);
  });

  test("nothing queued runs after the session has ended or stopped", () => {
    expect(effect).toMatch(/const advance = \(\) => \{ if \(closed\) return;/);
    // Closed before the finished timer is handed to React, so a second call cannot finish it twice.
    expect(effect).toMatch(/closed = true; const idle = createPomodoro\(prev\.config\); timerRef\.current = idle; setTimer\(idle\);/);
    expect(effect).toMatch(/return \(\) => \{ closed = true; clearInterval\(id\); sub\.remove\(\); \};/);
  });

  test("a trip to the background is measured by the wall clock, whichever callback comes first", () => {
    expect(effect).toMatch(/AppState\.addEventListener\("change", \(state\) => \{ continuous = false; if \(state === "active"\) advance\(\); \}\)/);
  });

  test("the end is announced when it is found on time, account first, and not when it is found on the way back", () => {
    expect(effect).toMatch(/if \(announcesEnd\(lateByMs\)\) \{ void notifyNow\(userId, t\("focus\.alarmFocusTitle"\)/);
    expect((effect.match(/notifyNow\(/g) ?? []).length).toBe(1);
  });

  test("this change hands nothing to the OS: no scheduled alert to ring twice or to be left behind", () => {
    const screen = code(focusScreen().getText(source));
    expect(screen).not.toMatch(/scheduleFocusEnd|cancelFocusEnd|createFocusEndAlert/);
  });
});

// The focus timer's effects live in a screen, and render tests are blocked in this repo, so this
// reads the source. It pins what made the timer stop in the background (Z109) and what the first
// review of the fix found: the session's own state, the closed flag, and who rings the end.
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
    expect(advance).not.toMatch(/=\s*timerRef\.current/);
  });

  test("nothing queued runs after the session has ended or stopped", () => {
    expect(effect).toMatch(/const advance = \(\) => \{ if \(closed\) return;/);
    expect(effect).toMatch(/if \(completed\) \{ closed = true;/);
    expect(effect).toMatch(/const ended = closed; closed = true;/);
  });

  test("hands the end alert to the OS when the timer starts, before the first tick", () => {
    expect(effect).toMatch(/createFocusEndAlert\(userId, \{ schedule: scheduleFocusEnd, cancel: cancelFocusEnd, now: Date\.now \}\)/);
    expect(effect).toMatch(/endAlert\?\.arm\(since\.wall \+ current\.remainingMs\);/);
    expect(effect.indexOf("endAlert?.arm(since.wall + current.remainingMs);")).toBeLessThan(effect.indexOf("setInterval("));
  });

  test("a trip to the background is measured by the wall clock, whichever callback comes first", () => {
    expect(effect).toMatch(/AppState\.addEventListener\("change", \(state\) => \{ continuous = false; if \(state === "active"\) advance\(\); \}\)/);
    expect(effect).toMatch(/sub\.remove\(\);/);
  });

  test("the OS alone rings an alert it has; the screen rings only when the OS never got it", () => {
    expect(effect).toMatch(/if \(endAlert && \(await endAlert\.finish\(\)\)\) return; await notifyNow\(userId, title, body\);/);
    // No "ring now" on top of a scheduled alert.
    expect(effect).not.toMatch(/scheduleFocusEnd\(userId/);
    expect((effect.match(/notifyNow\(/g) ?? []).length).toBe(1);
  });

  test("a changed device clock moves the alert; a failed arm is offered again on the tick", () => {
    expect(effect).toMatch(/if \(clockJumped\) endAlert\?\.arm\(at\.wall \+ next\.remainingMs\); else endAlert\?\.retry\(\);/);
    expect(effect).toMatch(/if \(next === current\) \{ endAlert\?\.retry\(\); return; \}/);
  });

  test("stopping before the end withdraws the alert; ending does not", () => {
    expect(effect).toMatch(/if \(!ended\) void endAlert\?\.withdraw\(\)\.catch\(\(\) => \{\}\);/);
    expect(effect).toMatch(/clearInterval\(id\);/);
  });

  test("while no session runs, nothing is left with the OS, and that is asked again on every return to the front", () => {
    const idle = effects().filter((text) => /if \(timer\.running \|\| !userId\) return;/.test(text));
    expect(idle).toHaveLength(1);
    expect(idle[0]).toMatch(/void cancelFocusEnd\(userId\)\.catch\(\(\) => \{\}\); const sub = AppState\.addEventListener\("change", \(state\) => \{ if \(state === "active"\) void cancelFocusEnd\(userId\)\.catch\(\(\) => \{\}\); \}\);/);
    expect(idle[0]).toMatch(/return \(\) => sub\.remove\(\); \}, \[timer\.running, userId\]\)$/);
  });
});

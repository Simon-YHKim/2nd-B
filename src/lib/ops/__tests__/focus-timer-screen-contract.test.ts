// The focus timer's effect lives in a screen, and render tests are blocked in this repo, so this
// reads the source. It pins the three things that made the timer stop in the background (Z109):
// the time is measured, the end alert is with the OS from the start, and coming back catches up.
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

/** The effect that owns the interval: the one whose body calls setInterval. */
function timerEffect(): string {
  const effects: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect") {
      const text = node.getText(source);
      if (/\bsetInterval\(/.test(text)) effects.push(text);
    }
    node.forEachChild(visit);
  };
  visit(focusScreen());
  expect(effects).toHaveLength(1);
  return effects[0];
}

const code = (text: string) => text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the focus screen's timer effect (Z109)", () => {
  const effect = code(timerEffect());

  test("advances by the clock, never by a counted second", () => {
    expect(effect).toMatch(/advanceByClock\(prev, since, at\)/);
    expect(effect).toMatch(/const at = Date\.now\(\);/);
    expect(effect).toMatch(/since = at;/);
    expect(effect).not.toMatch(/\btick\(/);
    expect(code(focusScreen().getText(source))).not.toMatch(/\btick\([^)]*,\s*1000\)/);
  });

  test("hands the end alert to the OS when the timer starts, for the moment the phase ends", () => {
    expect(effect).toMatch(/scheduleFocusEnd\(userId, new Date\(since \+ timerRef\.current\.remainingMs\)\)/);
    // Scheduled before the interval is created, so it does not wait for a first tick.
    expect(effect.indexOf("scheduleFocusEnd(userId, new Date(")).toBeLessThan(effect.indexOf("setInterval("));
  });

  test("catches up as soon as the app comes back to the front", () => {
    expect(effect).toMatch(/AppState\.addEventListener\("change"/);
    expect(effect).toMatch(/if \(state === "active"\) advance\(\);/);
    expect(effect).toMatch(/sub\.remove\(\);/);
  });

  test("rings at the end only when it found the end on time, under the scheduled identifier", () => {
    expect(effect).toMatch(/if \(ringsOnTime\(lateByMs\)\) await scheduleFocusEnd\(userId, null, alert\.identifier\);/);
    // Without a scheduled alert (web, refused permission) it falls back to the immediate one, account first.
    expect(effect).toMatch(/await notifyNow\(userId, title, body\);/);
  });

  test("pause, reset and leaving withdraw an alert that has not rung, and only that", () => {
    expect(effect).toMatch(/ringing = null;/);
    expect(effect).toMatch(/alert\.result === "scheduled" \? cancelFocusEnd\(userId, alert\.identifier\) : undefined/);
    expect(effect).toMatch(/clearInterval\(id\);/);
  });
});

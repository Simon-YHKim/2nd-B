import fs from "node:fs";
import path from "node:path";

// #858: the 세컨비 head rests NEUTRAL. positive/negative are situational, never constant.
//
// SecondbHead computes `effMood = reactMood ?? mood`, so `mood` is the RESTING face and
// only subscribeExpression can override it for a beat. A hard-coded `mood="positive"` on a
// screen therefore holds a smile for the whole visit — the constant smile #858 removed.
// A mood driven off component state (`mood={cleared ? "positive" : "neutral"}`) is a real
// reaction to a real event and stays allowed.
//
// #858 fixed seven callsites by grepping the JSX literal and missed the rest. This guard
// is that grep, made permanent.

const SRC = path.resolve(__dirname, "../..");

// Matches only a string-literal JSX attribute: mood="positive" / mood='negative'.
// Not `mood={x ? "positive" : "neutral"}` (braced, state-driven) and not `mood === "positive"`
// (the `"` must follow `=` immediately, which an equality operator cannot satisfy).
const CONSTANT_MOOD = /\bmood\s*=\s*["'](?:positive|negative)["']/;

// Every entry is a hole in the guard, so each needs a reason. Paths are relative to src/.
const EXEMPT = [
  // Mood gallery behind <DevOnlyRoute> (app/deepspace-preview.tsx): renders all three faces
  // side by side on purpose. Never shipped to a user.
  "screens/deepspace/DeepSpaceComponentsPreview.tsx",
  // Deep-space QA flow map behind <DevOnlyRoute> (app/deepspace-flowmap.tsx). Never shipped.
  "screens/deepspace/DeepSpaceFlowMapScreen.tsx",
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

describe("mascot rests neutral", () => {
  test("no production screen pins a constant mood on the 세컨비 head", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !EXEMPT.includes(rel(f)))
      .flatMap((f) =>
        fs
          .readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line: line.trim(), n: i + 1, file: rel(f) }))
          .filter(({ line }) => CONSTANT_MOOD.test(line)),
      )
      .map(({ file, n, line }) => `${file}:${n}  ${line}`);

    expect(offenders).toEqual([]);
  });

  test("the exempt list has no stale entries", () => {
    for (const p of EXEMPT) {
      expect(fs.existsSync(path.join(SRC, p))).toBe(true);
      expect(CONSTANT_MOOD.test(fs.readFileSync(path.join(SRC, p), "utf8"))).toBe(true);
    }
  });

  test("a state-driven mood is still allowed", () => {
    expect(CONSTANT_MOOD.test('<SecondbHead mood={complete ? "positive" : "neutral"} />')).toBe(false);
    expect(CONSTANT_MOOD.test('if (mood === "positive") return smile;')).toBe(false);
    expect(CONSTANT_MOOD.test('<SecondbHead mood="positive" />')).toBe(true);
  });
});

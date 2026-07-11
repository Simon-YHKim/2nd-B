import fs from "node:fs";
import path from "node:path";

// #680: Android Fabric drops function-form Pressable styles at runtime while the
// source reads fine — layout, borders, and touch targets silently vanish on device
// (records cards #885, weekly-growth reason chip #912, onboarding next CTA).
//
// The safe pattern is a static `style` plus `android_ripple` for press feedback.
// This guard is the sweep made permanent: no `style={({ pressed }) => ...}` (or any
// function-form style) on production screens, whatever the function returns — even a
// feedback-only `(pressed ? {opacity} : null)` erases the pressed state on Fabric,
// and the next editor to touch it tends to move layout into the function.

const SRC = path.resolve(__dirname, "../..");

// A style attribute whose value opens with a function: style={( or style={({...
const FUNCTION_FORM_STYLE = /\bstyle\s*=\s*\{\s*\(/;

// Every entry is a hole in the guard, so each needs a reason. Paths are relative to src/.
const EXEMPT: string[] = [];

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

describe("no function-form Pressable styles (#680 Fabric drop)", () => {
  test("no production screen passes a function as a style prop", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => !EXEMPT.includes(rel(f)))
      .flatMap((f) =>
        fs
          .readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line: line.trim(), n: i + 1, file: rel(f) }))
          .filter(({ line }) => FUNCTION_FORM_STYLE.test(line)),
      )
      .map(({ file, n, line }) => `${file}:${n}  ${line}`);

    expect(offenders).toEqual([]);
  });

  test("the exempt list has no stale entries", () => {
    for (const p of EXEMPT) {
      expect(fs.existsSync(path.join(SRC, p))).toBe(true);
    }
  });
});

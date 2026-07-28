import fs from "node:fs";
import path from "node:path";

// #680: Android Fabric drops function-form Pressable props at runtime while the
// source reads fine — layout, borders, and touch targets silently vanish on device
// (records cards #885, weekly-growth reason chip #912, onboarding next CTA).
//
// The safe pattern is a static `style` plus `android_ripple` (or local
// onPressIn/onPressOut state) for press feedback.
//
// TWO function-form shapes exist and BOTH have shipped a live defect:
//
//   1. function-form STYLE      style={({ pressed }) => ...}
//   2. function-as-CHILDREN     <Pressable ...>{({ pressed }) => ...}</Pressable>
//
// The original guard only saw shape 1, and only when `style={(` appeared on a
// SINGLE LINE. That left two holes, both of which were occupied:
//   · `src/components/m3/MdButton.tsx` used shape 2 — the repo-wide M3 button,
//     which is what erased the onboarding Get started target (#1128 patched that
//     ONE screen locally; the primitive is fixed in 2단계).
//   · `src/app/capture.tsx` submit CTA wrote shape 1 across four lines as the
//     else-branch of a ternary, so the line regex never matched it.
//
// The scans below are brace-matched, so neither hole survives.

const SRC = path.resolve(__dirname, "../..");

// A style attribute whose value opens with a function: style={( or style={({...
// Kept as the cheap first pass; the brace-matched scan below is the real gate.
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

// Normalize CRLF FIRST (a \r\n file once turned a slice guard into a
// 2-character no-op that passed forever).
const read = (file: string) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const lineAt = (src: string, index: number) => src.slice(0, index).split("\n").length;

/** Contents of the JSX expression container whose opening brace is at `open`. */
function braceBody(src: string, open: number): string {
  let depth = 0;
  let i = open;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

/** True when the expression itself evaluates to a function — an `=>` that sits
 *  outside every bracket. `[a, xs.map((x) => x)]` is an ARRAY (the arrow is
 *  nested) and must not trip; `cond ? [a] : ({pressed}) => [b]` is a FUNCTION on
 *  one branch and must. */
function hasTopLevelArrow(body: string): boolean {
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (c === "=" && body[i + 1] === ">" && depth === 0) return true;
  }
  return false;
}

/** True when the expression STARTS with an arrow function — the render-prop
 *  child shape. `(() => {...})()` is an IIFE (a value) and must not trip;
 *  `(xs).map(...)` is a call and must not trip. */
function startsWithArrowFunction(body: string): boolean {
  const s = body.replace(/^\s+/, "");
  if (/^[A-Za-z_$][\w$]*\s*=>/.test(s)) return true;
  if (s[0] !== "(") return false;
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") {
      depth -= 1;
      if (depth === 0) return /^\s*=>/.test(s.slice(i + 1));
    }
  }
  return false;
}

function scanned(): { file: string; src: string }[] {
  return sourceFiles(SRC)
    .filter((f) => !EXEMPT.includes(rel(f)))
    .map((f) => ({ file: rel(f), src: read(f) }));
}

describe("no function-form Pressable styles (#680 Fabric drop)", () => {
  test("no production screen passes a function as a style prop (single line)", () => {
    const offenders = scanned().flatMap(({ file, src }) =>
      src
        .split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => FUNCTION_FORM_STYLE.test(line))
        .map(({ n, line }) => `${file}:${n}  ${line}`),
    );

    expect(offenders).toEqual([]);
  });

  test("no style prop evaluates to a function, however it is spread over lines", () => {
    const offenders: string[] = [];
    for (const { file, src } of scanned()) {
      const re = /\bstyle\s*=\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const open = m.index + m[0].length - 1;
        const body = braceBody(src, open);
        if (hasTopLevelArrow(body)) {
          offenders.push(`${file}:${lineAt(src, m.index)}  ${body.trim().replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("no component passes a render-prop function as JSX children", () => {
    const offenders: string[] = [];
    for (const { file, src } of scanned()) {
      // `>` that closes a JSX tag (not the `>` of `=>`), then an expression
      // container. `/>` is allowed through: the arrow-head check below rejects
      // the sibling-expression forms anyway.
      const re = /([^=])>\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const open = m.index + m[0].length - 1;
        const body = braceBody(src, open);
        if (startsWithArrowFunction(body)) {
          offenders.push(`${file}:${lineAt(src, open)}  ${body.trim().replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the exempt list has no stale entries", () => {
    for (const p of EXEMPT) {
      expect(fs.existsSync(path.join(SRC, p))).toBe(true);
    }
  });

  // The detectors are the guard. Pin them against the two shapes that actually
  // shipped, and against the value-shaped lookalikes that must stay legal - a
  // guard that over-fires gets exempted into uselessness.
  describe("detectors", () => {
    test("hasTopLevelArrow catches the ternary-branch function style (capture submit CTA)", () => {
      expect(
        hasTopLevelArrow("\n !canSubmit\n ? [styles.tossBtn, styles.tossBtnDisabled]\n : ({ pressed }) => [styles.tossBtn, pressed && styles.tossBtnPressed]\n"),
      ).toBe(true);
      expect(hasTopLevelArrow("({ pressed }) => [a, pressed && b]")).toBe(true);
      expect(hasTopLevelArrow("(state) => state.pressed")).toBe(true);
    });

    test("hasTopLevelArrow leaves array/object styles with nested callbacks alone", () => {
      expect(hasTopLevelArrow("[styles.a, cond && styles.b, style]")).toBe(false);
      expect(hasTopLevelArrow("[s.bar, { width: `${Math.max(...xs.map((x) => x.n))}%` }]")).toBe(false);
      expect(hasTopLevelArrow("{ marginTop: 6 }")).toBe(false);
    });

    test("startsWithArrowFunction catches the MdButton render-prop child shape", () => {
      expect(startsWithArrowFunction("({ pressed }) => (\n <View />\n)")).toBe(true);
      expect(startsWithArrowFunction("state => <View />")).toBe(true);
    });

    test("startsWithArrowFunction leaves maps and IIFEs alone", () => {
      expect(startsWithArrowFunction('(["main", "side"] as const).map((tk) => <View key={tk} />)')).toBe(false);
      expect(startsWithArrowFunction("(entries ?? []).map((e) => <Row key={e.id} />)")).toBe(false);
      expect(startsWithArrowFunction("(() => { const k = 1; return <View key={k} />; })()")).toBe(false);
    });
  });
});

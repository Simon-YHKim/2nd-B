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

const isWordChar = (c: string | undefined) => c !== undefined && /[\w$]/.test(c);

/** True when the expression itself evaluates to a function — an `=>` OR a
 *  `function` keyword that sits outside every bracket. `[a, xs.map((x) => x)]`
 *  is an ARRAY (the arrow is nested) and must not trip; `cond ? [a] :
 *  ({pressed}) => [b]` is a FUNCTION on one branch and must.
 *
 *  The `function` arm exists because S5 found it missing (T-R1-S2-S5-01-reply
 *  V2, "7번째 구멍"): the arrow-only detector let
 *  `style={function ({ pressed }) { return [...] }}` through, which is the same
 *  Fabric-dropped function-form style in different syntax. A `function` used as
 *  a property KEY (`{ function: 1 }`) can only appear inside braces, so the
 *  depth-0 requirement already excludes it. */
function isFunctionValued(body: string): boolean {
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === "(" || c === "[" || c === "{") {
      depth += 1;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;
    if (c === "=" && body[i + 1] === ">") return true;
    if (
      c === "f" &&
      body.startsWith("function", i) &&
      !isWordChar(body[i - 1]) &&
      !isWordChar(body[i + 8])
    ) {
      return true;
    }
  }
  return false;
}

/** True when the expression STARTS with a function — the render-prop child
 *  shape. `(() => {...})()` is an IIFE (a value) and must not trip;
 *  `(xs).map(...)` is a call and must not trip. */
function startsWithFunction(body: string): boolean {
  const s = body.replace(/^\s+/, "");
  if (/^(async\s+)?function\b/.test(s)) return true;
  if (/^(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(s)) return true;
  const open = s.startsWith("async") ? s.indexOf("(") : 0;
  if (open < 0 || s[open] !== "(") return false;
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === "(") depth += 1;
    else if (s[i] === ")") {
      depth -= 1;
      if (depth === 0) return /^\s*=>/.test(s.slice(i + 1));
    }
  }
  return false;
}

// Only these tags carry the Fabric touch contract. S5 showed the tag-agnostic
// scan rejected a LEGITIMATE render prop (`<Loader>{({ready}) => ...}</Loader>`),
// and a guard that over-fires gets exempted into uselessness.
const TOUCH_TAG = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|TouchableNativeFeedback)\b/g;

/** Index of the `>` that closes the opening tag starting at `from`, or -1.
 *  Skips `>` inside attribute expressions and string/template literals. */
function openingTagEnd(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
    } else if (c === ">" && depth === 0) return i;
  }
  return -1;
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

  test("no style prop evaluates to a function, however it is spread over lines or written", () => {
    const offenders: string[] = [];
    for (const { file, src } of scanned()) {
      const re = /\bstyle\s*=\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const open = m.index + m[0].length - 1;
        const body = braceBody(src, open);
        if (isFunctionValued(body)) {
          offenders.push(`${file}:${lineAt(src, m.index)}  ${body.trim().replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("no Pressable-family tag takes a render-prop function as its children", () => {
    const offenders: string[] = [];
    for (const { file, src } of scanned()) {
      TOUCH_TAG.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TOUCH_TAG.exec(src))) {
        const gt = openingTagEnd(src, m.index);
        if (gt < 0 || src[gt - 1] === "/") continue; // self-closing: no children
        const rest = src.slice(gt + 1);
        const lead = rest.length - rest.replace(/^\s+/, "").length;
        if (rest[lead] !== "{") continue;
        const body = braceBody(src, gt + 1 + lead);
        if (startsWithFunction(body)) {
          offenders.push(
            `${file}:${lineAt(src, m.index)}  <${m[1]}> ${body.trim().replace(/\s+/g, " ").slice(0, 80)}`,
          );
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
    test("isFunctionValued catches the ternary-branch function style (capture submit CTA)", () => {
      expect(
        isFunctionValued("\n !canSubmit\n ? [styles.tossBtn, styles.tossBtnDisabled]\n : ({ pressed }) => [styles.tossBtn, pressed && styles.tossBtnPressed]\n"),
      ).toBe(true);
      expect(isFunctionValued("({ pressed }) => [a, pressed && b]")).toBe(true);
      expect(isFunctionValued("(state) => state.pressed")).toBe(true);
    });

    // S5 (T-R1-S2-S5-01-reply V2) found this shape passing the arrow-only
    // detector. Same Fabric-dropped function-form style, different syntax.
    test("isFunctionValued catches the `function` expression form (S5 hole 7)", () => {
      expect(
        isFunctionValued("function ({ pressed }) {\n  return [styles.tossBtn, pressed && styles.tossBtnPressed];\n}"),
      ).toBe(true);
      expect(isFunctionValued("function styleFor(state) { return [a]; }")).toBe(true);
      expect(isFunctionValued("cond ? [a] : function ({ pressed }) { return [b]; }")).toBe(true);
      expect(isFunctionValued("async function ({ pressed }) { return [a]; }")).toBe(true);
    });

    test("isFunctionValued leaves array/object styles with nested callbacks alone", () => {
      expect(isFunctionValued("[styles.a, cond && styles.b, style]")).toBe(false);
      expect(isFunctionValued("[s.bar, { width: `${Math.max(...xs.map((x) => x.n))}%` }]")).toBe(false);
      expect(isFunctionValued("{ marginTop: 6 }")).toBe(false);
      // `function` as an object property KEY is legal and must not trip.
      expect(isFunctionValued("[a, { function: 1 }]")).toBe(false);
      // a nested `function` expression inside an array is still an ARRAY value.
      expect(isFunctionValued("[a, xs.filter(function (x) { return x; })]")).toBe(false);
    });

    test("startsWithFunction catches the MdButton render-prop child shape", () => {
      expect(startsWithFunction("({ pressed }) => (\n <View />\n)")).toBe(true);
      expect(startsWithFunction("state => <View />")).toBe(true);
      expect(startsWithFunction("function ({ pressed }) { return <View />; }")).toBe(true);
    });

    test("startsWithFunction leaves maps and IIFEs alone", () => {
      expect(startsWithFunction('(["main", "side"] as const).map((tk) => <View key={tk} />)')).toBe(false);
      expect(startsWithFunction("(entries ?? []).map((e) => <Row key={e.id} />)")).toBe(false);
      expect(startsWithFunction("(() => { const k = 1; return <View key={k} />; })()")).toBe(false);
    });

    // S5 (T-R1-S2-S5-01-reply V2) showed the tag-agnostic children scan
    // rejecting a legitimate NON-Pressable render prop. The scan is now scoped
    // to the tags that actually carry the Fabric touch contract.
    test("the children scan is scoped to Pressable-family tags only", () => {
      const legit = 'function Loader({ children }: { children: (v: { ready: boolean }) => unknown }) {\n  return children({ ready: true });\n}\nconst x = <Loader>{({ ready }) => (ready ? "ready" : "waiting")}</Loader>;\n';
      const offending = "const y = <Pressable onPress={go}>{({ pressed }) => <View />}</Pressable>;\n";
      const scan = (src: string) => {
        const hits: string[] = [];
        TOUCH_TAG.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = TOUCH_TAG.exec(src))) {
          const gt = openingTagEnd(src, m.index);
          if (gt < 0 || src[gt - 1] === "/") continue;
          const rest = src.slice(gt + 1);
          const lead = rest.length - rest.replace(/^\s+/, "").length;
          if (rest[lead] !== "{") continue;
          if (startsWithFunction(braceBody(src, gt + 1 + lead))) hits.push(m[1]);
        }
        return hits;
      };
      expect(scan(legit)).toEqual([]);
      expect(scan(offending)).toEqual(["Pressable"]);
    });
  });
});

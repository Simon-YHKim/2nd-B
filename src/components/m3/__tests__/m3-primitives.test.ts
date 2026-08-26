// Source-discipline guard for the M3 primitive kit (rev2 migration, P1b).
// There is no RN renderer in this jest setup (testEnvironment: node), so — like
// the deep-space source guards — these tests read each primitive's source and
// assert token discipline + a11y wiring rather than rendering.
import { readFileSync } from "node:fs";
import path from "node:path";

const M3_DIR = path.resolve(__dirname, "..");

function read(file: string): string {
  return readFileSync(path.join(M3_DIR, file), "utf8");
}

/**
 * 주석을 걷는다. 아래 위생 검사(hex 리터럴 / rgba / theme-tokens import /
 * em dash)는 **코드**를 겨냥한 것인데, 주석까지 보면 규칙을 설명하는 문장이
 * 그 규칙에 걸린다.
 *
 * 2026-08-27 에 실제로 그랬다: MdButton 의 비활성 색을 미리 합성하면서
 * "왜 여기서 `theme/tokens` 를 import 하지 않는가"를 주석으로 적었더니
 * `theme/tokens` 금지 검사가 그 문장을 잡았고, 바탕색 값을 적은 문장은
 * hex 리터럴 검사에 걸렸다. 즉 **가드가 자기 근거를 적지 못하게 막고 있었다.**
 *
 * 문자열 리터럴은 살린다 (지우면 코드 안의 진짜 위반을 놓친다).
 */
function stripComments(src: string): string {
  let out = "";
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === "code") {
      if (c === "/" && d === "/") { mode = "line"; i++; out += "  "; continue; }
      if (c === "/" && d === "*") { mode = "block"; i++; out += "  "; continue; }
      if (c === "'") mode = "sq";
      else if (c === '"') mode = "dq";
      else if (c === "`") mode = "tpl";
      out += c;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") { mode = "code"; out += c; } else out += " ";
      continue;
    }
    if (mode === "block") {
      if (c === "*" && d === "/") { mode = "code"; i++; out += "  "; continue; }
      out += c === "\n" ? "\n" : " ";
      continue;
    }
    if (c === "\\") { out += c + (d ?? ""); i++; continue; }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) {
      mode = "code";
    }
    out += c;
  }
  return out;
}

const HYGIENE_FILES = [
  "MdButton.tsx",
  "SegBtn.tsx",
  "MdCard.tsx",
  "MdChip.tsx",
  "Field.tsx",
  "MdNavBar.tsx",
  "ProgressLinear.tsx",
  "typeface.ts",
];

const INTERACTIVE = ["MdButton.tsx", "SegBtn.tsx", "MdChip.tsx", "MdNavBar.tsx"];
// MdCard joined this list on 2026-08-20. It used to derive its height from
// padding alone, so when `--u` went 4px -> 2px its interactive variant fell to
// 32-36dp on three live surfaces before anything failed. Nothing in CI was
// watching, because MdCard was not in this array.
const TOUCH_TARGET = ["MdButton.tsx", "SegBtn.tsx", "MdChip.tsx", "Field.tsx", "MdNavBar.tsx", "MdCard.tsx"];

describe("M3 primitive kit — token discipline", () => {
  test.each(HYGIENE_FILES)("%s consumes m3.* tokens and holds no raw color literals", (file) => {
    const raw = read(file);
    // 위생 검사는 코드만 본다. 주석까지 보면 규칙을 설명하는 문장이 그 규칙에
    // 걸린다 (stripComments 의 주석 참조).
    const src = stripComments(raw);
    expect(src).toMatch(/from ["']@\/lib\/theme\/m3["']/);
    expect(src).toContain("m3.");
    // no hex color literals — everything routes through m3.* (DESIGN.md rule)
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    // no inline rgba — translucency comes from token colors + m3.state opacities
    expect(src).not.toMatch(/rgba\(/);
    // no legacy cosmic-pixel skin imports (m3 track is the point of P1b)
    expect(src).not.toMatch(/theme\/tokens|theme\/gameboy/);
    // no em dashes in USER-FACING code. 주석의 em dash 는 걷힌 뒤라 안 걸린다.
    expect(src).not.toContain("—");
  });
});

describe("M3 primitive kit — accessibility", () => {
  test.each(INTERACTIVE)("%s wires accessibilityRole + accessibilityState", (file) => {
    const src = read(file);
    expect(src).toContain("accessibilityRole");
    expect(src).toContain("accessibilityState");
  });

  test.each(TOUCH_TARGET)("%s declares a >=44dp touch target", (file) => {
    const src = read(file);
    // `m3.minTouch` is the token form of the same 44 (src/lib/theme/m3.ts); the
    // literal form stays accepted so the older primitives need no churn.
    expect(src).toMatch(/minHeight:\s*(m3\.minTouch|4[4-9]|[5-9]\d|\d{3})/);
  });
});

describe("MdNavBar — active state is not color alone", () => {
  const src = read("MdNavBar.tsx");
  test("active tab shows a pill indicator + selected a11y state", () => {
    expect(src).toContain("accessibilityState={{ selected: on }}");
    expect(src).toMatch(/on && \{ backgroundColor/);
  });
});

describe("MdButton / MdChip — approved shapes", () => {
  test("MdButton uses the stadium (full) corner", () => {
    expect(read("MdButton.tsx")).toContain("m3.shape.full");
  });
  test("MdChip uses the 8dp (small) corner, not a pill", () => {
    const src = read("MdChip.tsx");
    expect(src).toContain("m3.shape.small");
    expect(src).not.toContain("m3.shape.full");
  });
});

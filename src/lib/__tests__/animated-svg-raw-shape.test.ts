import fs from "node:fs";
import path from "node:path";

// React Native's Animated wrapper injects `collapsable={false}`. Passing a raw
// react-native-svg primitive to createAnimatedComponent leaks that prop to the
// web DOM and opens Expo's error overlay. Wrap SVG primitives in a component
// that strips `collapsable` first (see SecondbHead and DeepSpaceLoader).

const SRC = path.resolve(__dirname, "../..");
const RAW_ANIMATED_SVG =
  /Animated\.createAnimatedComponent\(\s*(Rect|Line|Circle|Path|Ellipse|Polygon|Polyline)\s*\)/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const read = (file: string) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");
const lineAt = (source: string, index: number) => source.slice(0, index).split("\n").length;

describe("animated SVG primitives on web", () => {
  test("production source never animates a raw react-native-svg shape", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const source = read(file);
      if (!/from\s+["']react-native-svg["']/.test(source)) continue;

      for (const match of source.matchAll(RAW_ANIMATED_SVG)) {
        offenders.push(`${rel(file)}:${lineAt(source, match.index)}  ${match[0].replace(/\s+/g, " ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the detector handles multiline raw shapes without flagging safe wrappers", () => {
    const raw = [
      "Animated.createAnimatedComponent(Rect)",
      "Animated.createAnimatedComponent(\n  Line\n)",
    ].join("\n");
    const safe = [
      "Animated.createAnimatedComponent(SvgRect)",
      "Animated.createAnimatedComponent(SvgLine)",
      "Animated.createAnimatedComponent(Pressable)",
    ].join("\n");

    expect([...raw.matchAll(RAW_ANIMATED_SVG)].map((match) => match[1])).toEqual(["Rect", "Line"]);
    expect([...safe.matchAll(RAW_ANIMATED_SVG)]).toEqual([]);
  });
});

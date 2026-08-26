// 캐논이 **이름으로** 부르는 아이콘에 그림이 있는가.
//
// 이름은 `design/proto_rev2/reference-app/data/**.json` 이 주고, 그림은
// `pixel-glyphs.ts` 가 갖는다. 둘이 어긋나도 **아무 일도 안 일어난다** —
// 예외가 아니라 아이콘 자리가 비거나 대체 표시로 떨어지고, 타입검사도
// 통과하고 화면도 안 죽는다. 조용해서 더 위험한 종류의 어긋남이다.
//
// 그래서 여기서 **센다.** 두 가지를 지킨다:
//
//   (1) 그림 없는 이름의 수는 **줄기만 하고 늘지 않는다.** 캐논에 새 이름을
//       넣으면서 글리프를 안 그리면 이 검사가 깨진다.
//   (2) `canonGlyph()` 는 어떤 이름을 받아도 실재하는 글리프를 돌려준다 —
//       빈 아이콘이 화면에 뜨는 일이 없어야 한다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { PIXEL_GLYPHS, GLYPH_ALIAS, canonGlyph } from "../pixel-glyphs";

const ROOT = join(__dirname, "..", "..", "..", "..");
const DATA = join(ROOT, "design", "proto_rev2", "reference-app", "data");

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) jsonFiles(full, out);
    else if (e.endsWith(".json")) out.push(full);
  }
  return out;
}

/** 캐논 JSON 어디에 있든 `icon:` 문자열 값을 전부 긁는다. */
function canonIconNames(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const visit = (node: unknown, file: string): void => {
    if (Array.isArray(node)) return node.forEach((n) => visit(n, file));
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "icon" && typeof v === "string" && v) {
        if (!found.has(v)) found.set(v, new Set());
        found.get(v)!.add(relative(DATA, file).split(sep).join("/"));
      } else visit(v, file);
    }
  };
  for (const f of jsonFiles(DATA)) {
    try {
      visit(JSON.parse(readFileSync(f, "utf8")), f);
    } catch {
      // 캐논에 JSON 아닌 파일이 섞여도 이 검사가 죽을 이유는 없다.
    }
  }
  return found;
}

const names = [...canonIconNames().keys()].sort();
const drawn = (n: string) => n in GLYPH_ALIAS || n in PIXEL_GLYPHS;

describe("캐논 아이콘 이름 ↔ 픽셀 글리프", () => {
  it("캐논에서 이름을 실제로 긁어온다", () => {
    // 긁기가 조용히 0건이 되면 아래 검사가 전부 무의미해진다.
    expect(names.length).toBeGreaterThan(50);
  });

  it("그림 없는 이름의 수는 줄기만 한다", () => {
    const missing = names.filter((n) => !drawn(n));
    // 2026-08-26 기준선(62 → 56, 규칙 1 이주 중 여섯을 더 그렸다). **올리지 말 것** — 올린다는 것은 캐논에
    // 이름을 새로 넣으면서 글리프를 안 그렸다는 뜻이고, 그러면 그 자리에
    // 대체 표시가 뜬다. 글리프를 그려서 내리는 것이 유일한 정당한 변경이다.
    const BASELINE = 56;
    expect(missing.length).toBeLessThanOrEqual(BASELINE);
  });

  it("어떤 이름을 받아도 실재하는 글리프로 떨어진다 — 빈 아이콘 금지", () => {
    for (const n of names) expect(PIXEL_GLYPHS[canonGlyph(n)]).toBeDefined();
    expect(PIXEL_GLYPHS[canonGlyph("이런 이름은 캐논에 없다")]).toBeDefined();
  });
});

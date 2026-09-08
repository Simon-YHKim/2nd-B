// 캐논이 부르는 아이콘 이름이 **화면을 죽이지 않는가.**
//
// `canon-icon-names.test.ts` 는 "그림이 없는 이름이 몇 개인가"를 센다. 이 파일은
// 다른 것을 묻는다 — **그림이 없을 때 무슨 일이 나는가.**
//
// ## 왜 따로 있는가 (2026-08-26)
//
// 캐논 이름이 아이콘으로 흘러드는 길이 하나가 아니었다:
//
//   canonGlyph()  → 모르는 이름이면 `sparkle` 로 떨어진다        (안전)
//   gapGlyph()    → 34개 허용목록 밖이면 `sparkle` 로 떨어진다   (안전, 단 목록이 좁다)
//   SbIcon        → **폴백이 없었다**                            ← 그때 고친 곳
//
// 아이콘이 안 보이는 것과 화면이 죽는 것은 다른 값이다. 이 파일은 두 번째만 막는다.
//
// ## ⚠ 2026-09-08 정정 — 08-26 의 이 파일은 **엉뚱한 컴포넌트를 지켰다**
//
// 여기 이렇게 적혀 있었다:
//
//   > `src/app/onboarding.tsx:66` 이 캐논 JSON 값을 `s.icon as SbIconName` 으로
//   > 검사 없이 캐스팅해서 **`SbIcon` 에 넘긴다.**
//
// 그 전제가 **틀렸다.** 실측하면 셋 다 아니다:
//
//   · `as SbIconName` 은 저장소 어디에도 없다 (주석 안을 빼면 0건).
//   · `onboarding.tsx:66` 은 `skipLabel` 이다.
//   · `onboarding.tsx` 는 `<SbIcon>` 을 **한 번도 그리지 않는다.**
//
// 실제 길은 이랬다 — `onboarding.tsx` 가 `as AnyGlyphName` 으로 캐스팅해서
// **`PixelGlyph` 로 직접** 넘겼고, 그 안의 `PixelGlyphRects` 가
// `PIXEL_GLYPHS[resolveGlyph(name)]` 로 색인했다. `resolveGlyph` 는 그려지지
// 않은 이름을 **그대로 돌려준다.** 그래서 `undefined.map(...)` — 08-26 이 막았다고
// 적은 바로 그 TypeError 가, 막지 않은 길에 그대로 남아 있었다.
//
// 즉 가드는 **위험이 지나지 않는 컴포넌트**에 붙어 있었다. 08-26 도 "캐논에 한 줄
// 더하면 온보딩이 죽는다" 를 정확히 알고 있었는데, 호출자를 잘못 지목한 탓에
// 자물쇠를 옆문에 달았다. 오늘 캐논이 부르는 이름 중 **그림이 없는 것이 56개**다.
//
// 그래서 이 회차가 고친 것은 셋이다:
//
//   · `onboarding.tsx` 의 캐스팅 → `canonGlyph()` (세탁을 없앤다)
//   · `PixelGlyphRects` → `glyphRects()` (그리는 쪽을 전역 함수로)
//   · `resolveGlyph` → `canonGlyph` 위임 (다음 호출자를 위해 함정을 닫는다)
//
// 검사도 그에 맞춰 넓혔다: 아래 "그리는 길" 과 "세탁" 두 절이 새로 생긴 것이다.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { GLYPH_ALIAS, PIXEL_GLYPHS, canonGlyph, glyphMarkup, glyphRects } from "../pixel-glyphs";

const ROOT = join(__dirname, "..", "..", "..", "..");

/** 앱이 실제로 `import` 하는 캐논. `src/lib/canon/index.ts` 가 여기서 읽는다.
 *
 *  ⚠ `design/proto_rev2/reference-app/data/` 에 같은 트리가 한 벌 더 있고 오늘은
 *  바이트까지 같지만, **앱이 읽는 것은 이쪽이다.** 가드는 지키려는 대상과 같은
 *  소스를 읽어야 한다. */
const CANON = join(ROOT, "public", "proto", "data");

function onboardingIcons(): string[] {
  const flows = JSON.parse(
    readFileSync(join(CANON, "screens", "flows.json"), "utf8"),
  ) as { onboardingSlides?: { icon?: string }[] };
  return (flows.onboardingSlides ?? []).map(s => s.icon ?? "");
}

/** 캐논 JSON 어디에 있든 `icon:` 문자열 값을 전부 긁는다. */
function canonIconNames(): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "icon" && typeof v === "string" && v) found.add(v);
      else visit(v);
    }
  };
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".json")) {
        try {
          visit(JSON.parse(readFileSync(full, "utf8")));
        } catch {
          // 캐논에 JSON 아닌 파일이 섞여도 이 검사가 죽을 이유는 없다.
        }
      }
    }
  };
  walk(CANON);
  return [...found].sort();
}

describe("모르는 아이콘 이름이 화면을 죽이지 않는다", () => {
  it("canonGlyph 는 무엇을 받아도 실재하는 글리프를 준다", () => {
    for (const name of ["", "이런 이름은 없다", "definitely_not_a_glyph", "__proto__"]) {
      const g = canonGlyph(name);
      expect(PIXEL_GLYPHS[g]).toBeDefined();
      expect(() => glyphMarkup(g, "#fff")).not.toThrow();
    }
  });

  it("SbIcon 이 폴백 없이 글리프를 찾지 않는다", () => {
    // 이 검사가 붙드는 것은 파일의 **모양**이 아니라 계약이다: 캐스팅으로 들어온
    // 이름이 그대로 색인에 쓰이면 안 된다. 렌더 테스트가 이 저장소에서 막혀 있어
    // (RN 0.85 + jest, docs 참조) 소스를 읽는다.
    const src = readFileSync(
      join(ROOT, "src", "components", "deepspace", "shell", "SbIcon.tsx"),
      "utf8",
    );
    expect(src).toMatch(/canonGlyph\(name\)/);
    // 옛 형태로 되돌아가면 빨강.
    expect(src).not.toMatch(/glyphMarkup\(\s*GLYPH_ALIAS\[name\]/);
  });

  it("온보딩이 넘기는 캐논 아이콘이 지금 전부 그려져 있다", () => {
    // 폴백이 생겼으니 이제 이건 크래시가 아니라 **품질** 문제다 — 그래도
    // 첫 화면에 대체 표시가 뜨는 것은 알고 있어야 한다.
    const icons = onboardingIcons();
    expect(icons.length).toBeGreaterThan(0);
    for (const name of icons) {
      // 대체 표시로 떨어지지 않고 **그 이름 자체**가 그려져 있어야 한다.
      expect(canonGlyph(name)).not.toBe("sparkle");
    }
  });
});

// ── 그리는 길 ───────────────────────────────────────────────────────────────
//
// 위의 절은 **이름을 고르는 함수**(`canonGlyph`)를 검사한다. 08-26 의 구멍은
// 거기가 아니라 **그 함수를 부르지 않는 길**에 있었다. 그리는 쪽을 따로 검사한다.
//
// 왜 렌더가 아니라 함수인가: 컴포넌트 렌더 테스트가 이 저장소에서 막혀 있다
// (RN 0.85 upstream). 그래서 색인을 `glyphRects()` 로 빼고 계약을 직접 부른다.
describe("그리는 쪽의 색인은 전역 함수다", () => {
  it("그려지지 않은 이름에도 비어 있지 않은 배열을 준다", () => {
    expect(glyphRects("이런 이름은 캐논에 없다").length).toBeGreaterThan(0);
    expect(glyphRects("").length).toBeGreaterThan(0);
  });

  it("캐논이 부르는 이름 전부에 대해 그렇다 — 그림 없는 이름 포함", () => {
    const names = canonIconNames();
    // 긁기가 조용히 0건이 되면 아래 단언은 아무것도 안 지킨다.
    expect(names.length).toBeGreaterThan(50);

    // 그림 없는 이름이 실제로 있어야 이 검사가 무언가를 시험한다. 전부 그려져
    // 있으면 아래 단언은 공회전이고, 그 사실을 여기서 드러낸다.
    const undrawn = names.filter(n => !(n in GLYPH_ALIAS) && !(n in PIXEL_GLYPHS));
    expect(undrawn.length).toBeGreaterThan(0);

    expect(names.filter(n => glyphRects(n).length === 0)).toEqual([]);
  });

  it("PixelGlyphRects 가 글리프 표를 직접 색인하지 않는다", () => {
    // 되돌림을 붙든다: 직접 색인으로 돌아가면 폴백이 사라지고, 위 두 검사는
    // 함수만 부르므로 그 되돌림을 못 본다.
    const src = readFileSync(
      join(ROOT, "src", "components", "pixel", "PixelGlyph.tsx"),
      "utf8",
    );
    const code = src
      .split("\n")
      .filter(l => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).toMatch(/glyphRects\(name\)/);
    expect(code).not.toMatch(/PIXEL_GLYPHS\[/);
  });
});

// ── 세탁 ────────────────────────────────────────────────────────────────────
//
// `AnyGlyphName` 은 곧 **그려진 이름의 합집합**이라, 캐스팅만 안 하면 타입이 전부
// 막는다. 그래서 위험은 오직 캐스팅에서 온다 — 실제로 그런 자리가 딱 하나 있었고
// (`onboarding.tsx`), 그 하나가 08-26 이 못 본 길의 입구였다.
//
// 명단이 아니라 **0건**으로 적는다. 좁히는 함수(`canonGlyph`)가 이미 있어서
// 정당한 예외가 없기 때문이다. 정말 필요한 자리가 생기면 그때 이유와 함께
// 명단으로 바꾸면 된다.
describe("글리프 이름 타입을 세탁하는 캐스팅", () => {
  const LAUNDER = /\bas\s+(?:AnyGlyphName|PixelGlyphName|GlyphAliasName|SbIconName)\b/;
  /** 좁히는 함수들이 사는 곳. 여기서는 `Object.hasOwn` 뒤에서만 캐스팅한다. */
  const NARROWER = "src/components/pixel/pixel-glyphs.ts";

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "__mocks__") continue;
        sourceFiles(full, out);
      } else if (/\.tsx?$/.test(e.name)) {
        out.push(relative(ROOT, full).split(sep).join("/"));
      }
    }
    return out;
  }

  const files = sourceFiles(join(ROOT, "src"));

  /** 주석을 걷어낸 줄들. 대조와 스캔이 **같은 규칙으로** 읽어야 한다. */
  function codeLines(rel: string): string[] {
    return readFileSync(join(ROOT, rel), "utf8")
      .split("\n")
      .filter(l => {
        const t = l.trim();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      });
  }

  it("소스를 실제로 읽었다", () => {
    expect(files.length).toBeGreaterThan(200);
    // 양성 대조: 좁히는 함수 파일의 **코드**에 캐스팅이 남아 있어야 한다.
    //
    // ⚠ 처음에는 파일 전체를 통으로 읽었는데, 이 파일 주석이 옛 코드를 인용하며
    //   `as PixelGlyphName` 을 적고 있어서 **코드에서 캐스팅을 전부 지워도 대조가
    //   초록**이었다. 대조가 지키려는 것을 못 보면 대조가 아니다.
    const casts = codeLines(NARROWER).filter(l => LAUNDER.test(l));
    expect(casts.length).toBeGreaterThanOrEqual(2);
  });

  it("좁히는 함수 밖에서는 한 건도 없다", () => {
    const laundering = files.filter(
      rel => rel !== NARROWER && codeLines(rel).some(l => LAUNDER.test(l)),
    );
    expect(laundering).toEqual([]);
  });
});

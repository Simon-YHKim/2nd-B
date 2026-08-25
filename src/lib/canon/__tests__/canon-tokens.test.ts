// Drift guard for the generated design-token mirror (tokens.json ← m3-theme.css).
// Values are the documented rev2 defaults (design/proto_rev2/README.md §Design Tokens).

import { canonTokens } from "../index";

describe("canon design-token mirror", () => {
  it("carries all 4 palette sets", () => {
    expect(Object.keys(canonTokens.palettes).sort()).toEqual([
      "cyan-dark",
      "cyan-light",
      "violet-dark",
      "violet-light",
    ]);
  });

  it("pins the cyan-dark default scheme anchors", () => {
    const cd = canonTokens.palettes["cyan-dark"];
    expect(cd["--md-sys-color-primary"]).toBe("#86CFFF");
    expect(cd["--md-sys-color-surface"]).toBe("#0B0F14");
    expect(cd["--md-sys-color-outline-variant"]).toBe("#41484D");
  });

  it("pins the palette-independent deep-space accents", () => {
    expect(canonTokens.root["--sb-star"]).toBe("#CCFAFF");
    expect(canonTokens.root["--sb-star-core"]).toBe("#46B6FF");
    expect(canonTokens.root["--sb-polaris"]).toBe("#C8B6FF");
  });
});

// ── PIXEL-CLAY 쪽 앵커 (2026-08-28, P6 를 '가산'으로 닫는다) ──────────────────
//
// 발주는 "캐논 JSON 을 PIXEL-CLAY 로 갱신"이었는데, 실측이 그 전제를 뒤집었다:
// canonTokens 는 런타임 소비자가 0건이고 그 값은 **지금 배포된 /proto M3
// 프로토타입**을 기술한다 — 이주의 출발점 스냅샷이다. midnight 으로 덮으면 얻는 것
// 없이 기준선만 잃는다(docs/PIXEL-CLAY-MIGRATION.md 도 같은 이유로 이 결합을 이미
// 철회했다). 그래서 위의 세 검사는 **그대로 두고**, 목적지 쪽 앵커를 여기 더한다.
//
// 읽는 곳이 다르다: 위는 번들에 실린 캐논 JSON, 아래는 디스크의 레퍼런스 키트다
// (앱 번들에 157키를 싣지 않으려고 import 가 아니라 fs 로 읽는다 —
// canon-mirror.test.ts 와 같은 방식).
describe("PIXEL-CLAY v4 token anchors (destination, read from disk)", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const kit = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "..", "..", "..", "design", "pixel_clay_260825", "data", "tokens.json"),
      "utf8",
    ),
  ) as { palette: string; themeClass: string; vars: Record<string, string> };

  it("런타임 실측 덤프다 — 팔레트와 테마가 midnight/theme-dark", () => {
    expect(kit.palette).toBe("midnight");
    expect(kit.themeClass).toContain("theme-dark");
    expect(Object.keys(kit.vars).length).toBeGreaterThanOrEqual(150);
  });

  it("--u 는 2px 다 (CSS 텍스트에서 뜨면 4px 이 나온다)", () => {
    // 이 한 줄이 키트가 존재하는 이유다: 스타일시트는 :root 를 세 번 정의하고
    // 마지막이 이기는데, 정규식 추출기는 그 순서를 못 읽는다.
    expect(kit.vars["--u"]).toBe("2px");
  });

  it("딥스페이스 액센트는 캐논과 값이 같다 (이름만 --sb-* / --ds-*)", () => {
    expect(kit.vars["--ds-star"]).toBe(canonTokens.root["--sb-star"]);
    expect(kit.vars["--ds-core"]).toBe(canonTokens.root["--sb-star-core"]);
    expect(kit.vars["--ds-polaris"]).toBe(canonTokens.root["--sb-polaris"]);
  });

  it("midnight 램프의 양 끝이 박혀 있다", () => {
    expect(kit.vars["--c00"]).toBe("#0a0e18");
    expect(kit.vars["--c09"]).toBe("#5b8def");
  });
});

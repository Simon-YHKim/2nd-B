// Canon <-> renderer parity for the constellation home.
//
// The home's star topology exists TWICE: once in the canon
// (public/proto/data/core/constellation.json, read through src/lib/canon) and
// once as the hardcoded REV2_STARS array in ConstellationHome.tsx. S5 confirmed
// the gap (T-R1-S2-S5-01-reply, D2): canon.test.ts only checks the JSON's own
// internal routing, so editing the canon changed nothing on screen and nothing
// failed. That is how the picture and the number drift apart in silence.
//
// Two sets have to stay equal and nothing enforced it:
//   1. what the home DRAWS            REV2_STARS in ConstellationHome.tsx
//   2. what the headline AVERAGES     canon polarisBrightness.includedDomainIds
// Profile sits in (1) but not (2) on purpose - it is a self-description, not a
// life domain, and folding it into the headline would make the persona average
// partly an average of itself.
//
// Render tests are blocked in this repo (RN 0.85 + jest), so this reads the
// renderer's source the same way the other deep-space guards do. Normalize CRLF
// FIRST: this repo is core.autocrlf=true and an un-normalized slice guard has
// silently passed forever here before.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonConstellationLines, canonPolarisBrightness, canonPolarisGuide, canonStars } from "@/lib/canon";
import { HEADLINE_STAR_IDS } from "@/lib/persona/north-star";

const SRC = readFileSync(
  join(__dirname, "..", "ConstellationHome.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

/** The `REV2_STARS` literal, parsed out of the renderer source. */
function renderedStars(): { id: string; x: number; y: number }[] {
  const open = SRC.indexOf("const REV2_STARS");
  expect(open).toBeGreaterThan(-1);
  const start = SRC.indexOf("[", open);
  const end = SRC.indexOf("];", start);
  expect(end).toBeGreaterThan(start);
  const body = SRC.slice(start, end + 1);
  const out: { id: string; x: number; y: number }[] = [];
  const re = /\{\s*id:\s*"([^"]+)"\s*,\s*x:\s*(-?[\d.]+)\s*,\s*y:\s*(-?[\d.]+)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push({ id: m[1], x: Number(m[2]), y: Number(m[3]) });
  return out;
}

/** A `const NAME = { x: n, y: n }` literal from the renderer source. */
function renderedPoint(name: string): { x: number; y: number } {
  const m = new RegExp(`const ${name}\\s*=\\s*\\{\\s*x:\\s*(-?[\\d.]+)\\s*,\\s*y:\\s*(-?[\\d.]+)\\s*\\}`).exec(SRC);
  expect(m).not.toBeNull();
  return { x: Number(m![1]), y: Number(m![2]) };
}

describe("constellation home <-> canon parity", () => {
  const canonNonPolaris = canonStars.filter((s) => s.id !== "polaris");

  it("draws exactly the canon's non-Polaris stars, in canon order", () => {
    // The prototype's `leisure` id is this codebase's `recreation` (documented in
    // ConstellationHome.tsx). Map it so the comparison is about the SET, not the
    // historical naming.
    const canonIds = canonNonPolaris.map((s) => (s.id === "leisure" ? "recreation" : s.id));
    expect(renderedStars().map((s) => s.id)).toEqual(canonIds);
  });

  it("keeps every star coordinate identical to the canon", () => {
    const byId = new Map(
      canonNonPolaris.map((s) => [s.id === "leisure" ? "recreation" : s.id, { x: s.x, y: s.y }]),
    );
    for (const star of renderedStars()) {
      expect({ id: star.id, x: star.x, y: star.y }).toEqual({ id: star.id, ...byId.get(star.id) });
    }
  });

  it("keeps Polaris at the canon coordinate", () => {
    const polaris = canonStars.find((s) => s.id === "polaris");
    expect(polaris).toBeDefined();
    expect(renderedPoint("POLARIS")).toEqual({ x: polaris!.x, y: polaris!.y });
  });

  // The museum star carried `level: 4` in the canon and a matching MUSEUM_LEVEL
  // constant in the renderer, and this test used to pin the two together. Profile
  // replaced it precisely BECAUSE a star frozen at one level is dishonest, so the
  // guard inverts: neither side may reintroduce a fixed level for it.
  it("refuses to let the seventh star go back to a hardcoded level", () => {
    const profile = canonStars.find((s) => s.id === "profile");
    expect(profile).toBeDefined();
    expect(profile!.level).toBeUndefined();
    expect(/const\s+\w*PROFILE\w*_LEVEL/.test(SRC)).toBe(false);
    expect(SRC).not.toContain("MUSEUM_LEVEL");
  });

  // /museum lost its star in the same change. It is only still reachable because
  // the corner chip went in alongside; without this the swap silently strands a
  // whole screen, which is exactly what the two draft plans would have done.
  it("keeps a forward entry point to the museum after it lost its star", () => {
    expect(SRC).toContain("onMuseumPress");
    expect(SRC).toContain("ds.home.museumEntry");
  });

  // 커뮤니티 had the same defect with no star swap to explain it: the screen
  // shipped with no forward link from anywhere in the app, reachable only by
  // pasting an invite URL. Same guard so it cannot happen again.
  it("keeps a forward entry point to the community", () => {
    expect(SRC).toContain("onCommunityPress");
    expect(SRC).toContain("ds.home.communityEntry");
    // Adults only, fail-closed: an unknown age must not render the affordance.
    expect(SRC).toContain('isMinor === false ? (');
  });

  // The point of the whole file: the drawn set and the averaged set must differ
  // by EXACTLY the excluded home nodes, never by an accident.
  it("averages every drawn domain and nothing else", () => {
    const drawn = renderedStars().map((s) => s.id);
    const excludedNodes = canonPolarisBrightness.excludedHomeNodeIds; // ["profile"]
    const drawnDomains = drawn.filter((id) => !excludedNodes.includes(id));

    // SET equality, deliberately not order. The two orders differ on purpose and
    // both are correct: the renderer draws in Big Dipper geometry order
    // (career -> finance -> relation -> growth -> handle) so the bowl outline is
    // astronomically honest, while the canon lists the logical domain order. A
    // mean does not care which order it sums. Asserting array equality here made
    // this guard fail on that harmless difference on its first run.
    expect([...drawnDomains].sort()).toEqual([...HEADLINE_STAR_IDS].sort());
    // and the reverse direction: nothing averaged is missing from the picture.
    for (const id of HEADLINE_STAR_IDS) expect(drawn).toContain(id);
    // `collect` is a real data domain that the home does NOT draw, so it must be
    // absent from both sides.
    expect(drawn).not.toContain("collect");
    expect([...HEADLINE_STAR_IDS]).not.toContain("collect");
  });

  it("draws the profile star without letting it into the headline", () => {
    expect(renderedStars().map((s) => s.id)).toContain("profile");
    expect([...HEADLINE_STAR_IDS]).not.toContain("profile");
  });

  // ── the LINES, not just the points (added 2026-08-19) ───────────────
  //
  // The guards above pin every star's COORDINATES against the canon, but
  // nothing pinned the PATHS drawn between them. So the canon's `lines` and
  // `polarisGuide` strings could be edited, or the renderer's BOWL / HANDLE /
  // GUIDE arrays reordered, and the suite stayed green while the picture and
  // the canon disagreed. That is the same silent-drift shape this file was
  // created to close - it was just closed one level short.
  //
  // This mattered in practice: `CLAUDE.md` said the 북두칠성 -> 북극성 guide had
  // "렌더하는 코드가 0건" and that reading survived for months, because the only
  // thing anyone checked was whether `canonPolarisGuide` had consumers. The line
  // is on screen (ConstellationHome.tsx:646) and always was; it just never read
  // the canon. Pinning the STRING is what makes that checkable instead of
  // arguable.

  /** A `const NAME: HomeStarId[] = [...]` id list from the renderer source. */
  function renderedSegment(name: string): string[] {
    const m = new RegExp(`const ${name}:\\s*HomeStarId\\[\\]\\s*=\\s*\\[([^\\]]*)\\]`).exec(SRC);
    expect(m).not.toBeNull();
    return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }

  /**
   * Rebuild the SVG path the renderer draws, in canon (unscaled) coordinates.
   *
   * `pathOf` in the component runs each point through `px`/`py`, which multiply
   * by the responsive scale `k`. The scale is a render-time concern; the shape
   * is not. Rebuilding from the same constants without `k` gives exactly the
   * string the canon stores, so this can be an EQUALITY check rather than a
   * vaguer "looks similar" one.
   */
  function pathFrom(ids: string[], opts: { close?: boolean; then?: { x: number; y: number } } = {}): string {
    const at = (id: string) => {
      const s = renderedStars().find((r) => r.id === id);
      expect(s).toBeDefined();
      return s!;
    };
    let d = ids.map((id, i) => `${i === 0 ? "M" : "L"}${at(id).x},${at(id).y}`).join(" ");
    if (opts.then) d += ` L${opts.then.x},${opts.then.y}`;
    if (opts.close) d += " Z";
    return d;
  }

  it("draws the Big Dipper bowl exactly as the canon stores it", () => {
    expect(pathFrom(renderedSegment("BOWL"), { close: true })).toBe(canonConstellationLines[0]);
  });

  it("draws the handle exactly as the canon stores it", () => {
    expect(pathFrom(renderedSegment("HANDLE"))).toBe(canonConstellationLines[1]);
  });

  it("draws the pointer -> 북극성 guide exactly as the canon stores it", () => {
    // The two pointer stars (Merak -> Dubhe) extended to Polaris - the real
    // 지극성 path. `canonPolarisGuide` had zero consumers, so this is the first
    // thing that makes the canon's copy load-bearing.
    const guide = pathFrom(renderedSegment("GUIDE"), { then: renderedPoint("POLARIS") });
    expect(guide).toBe(canonPolarisGuide);
  });

  it("actually renders that guide path (not just computes it)", () => {
    // Cheap but load-bearing: if someone deletes the drawing the coordinates
    // above would still line up while nothing reached the screen.
    //
    // ⚠ 이 검사는 원래 `pathOf(GUIDE)}L${px(POLARIS.x)}…` 라는 **JSX 표현식을
    //   글자 그대로** 박고 있었다. PIXEL-CLAY 규칙 1 이주로 선이 `<Path>` 에서
    //   정수 `<Rect>` 셀로 바뀌자 깨졌다 — 검사가 붙들던 것이 "그려진다"가
    //   아니라 "그 문법으로 그려진다"였다는 뜻이다.
    //
    //   지금 붙드는 것: GUIDE 와 POLARIS 좌표가 **셀을 만드는 호출에 들어가고**,
    //   그 셀이 화면 원소로 나간다. 문법이 또 바뀌어도 뜻은 안 바뀐다.
    const call = /cellsOf\(\s*\[\.\.\.GUIDE\]\s*,\s*false\s*,\s*\[px\(POLARIS\.x\), py\(POLARIS\.y\)\]\s*\)/;
    expect(SRC).toMatch(call);
    // 그 결과가 실제로 렌더된다 — 계산만 하고 버리면 화면에는 아무것도 없다.
    expect(SRC).toMatch(/GUIDE_LINK_FILL/);
    expect(SRC).toMatch(/fill=\{GUIDE_LINK_FILL\}/);
  });

  it("draws the dipper outline too — bowl과 handle이 화면에 나간다", () => {
    // 위 두 검사는 좌표가 캐논과 같은지만 본다. 그 좌표로 만든 셀이 렌더에
    // 닿는지는 별개다(가이드선과 같은 이유로 따로 확인한다).
    expect(SRC).toMatch(/cellsOf\(BOWL, true\)/);
    expect(SRC).toMatch(/cellsOf\(HANDLE\)/);
    expect(SRC).toMatch(/fill=\{DIPPER_LINK_FILL\}/);
  });
});

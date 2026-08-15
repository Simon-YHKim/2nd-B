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

import { canonPolarisBrightness, canonStars } from "@/lib/canon";
import { HEADLINE_DOMAIN_IDS } from "@/lib/persona/north-star";

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
    expect([...drawnDomains].sort()).toEqual([...HEADLINE_DOMAIN_IDS].sort());
    // and the reverse direction: nothing averaged is missing from the picture.
    for (const id of HEADLINE_DOMAIN_IDS) expect(drawn).toContain(id);
    // `collect` is a real data domain that the home does NOT draw, so it must be
    // absent from both sides.
    expect(drawn).not.toContain("collect");
    expect([...HEADLINE_DOMAIN_IDS]).not.toContain("collect");
  });

  it("draws the profile star without letting it into the headline", () => {
    expect(renderedStars().map((s) => s.id)).toContain("profile");
    expect([...HEADLINE_DOMAIN_IDS]).not.toContain("profile");
  });
});

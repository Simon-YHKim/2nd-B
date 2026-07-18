// Star aliases (연동 P0③): the pseudonym vocabulary and its determinism.

import {
  STAR_ALIAS_PREFIXES_EN,
  STAR_ALIAS_PREFIXES_KO,
  STAR_ALIAS_SUFFIXES,
  starAliasFor,
  subjectKeyFor,
} from "../star-alias";

describe("alias vocabulary (Simon spec: 각 100가지 이상)", () => {
  test("100+ prefixes per locale and 100+ star suffixes, no duplicates", () => {
    expect(STAR_ALIAS_PREFIXES_KO.length).toBeGreaterThanOrEqual(100);
    expect(STAR_ALIAS_PREFIXES_EN.length).toBeGreaterThanOrEqual(100);
    expect(STAR_ALIAS_SUFFIXES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(STAR_ALIAS_PREFIXES_KO).size).toBe(STAR_ALIAS_PREFIXES_KO.length);
    expect(new Set(STAR_ALIAS_PREFIXES_EN).size).toBe(STAR_ALIAS_PREFIXES_EN.length);
    expect(new Set(STAR_ALIAS_SUFFIXES.map((s) => s.en)).size).toBe(STAR_ALIAS_SUFFIXES.length);
    expect(new Set(STAR_ALIAS_SUFFIXES.map((s) => s.ko)).size).toBe(STAR_ALIAS_SUFFIXES.length);
  });
});

describe("subjectKeyFor (pseudonymization)", () => {
  test("stable, name-free, and distinct across names", () => {
    const key = subjectKeyFor("홍길동");
    expect(key).toBe(subjectKeyFor("홍길동"));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).not.toContain("홍");
    expect(key).not.toBe(subjectKeyFor("김철수"));
    // Leading/trailing whitespace must not fork the identity.
    expect(subjectKeyFor(" 홍길동 ")).toBe(key);
  });
});

describe("starAliasFor", () => {
  test("deterministic per key + locale, and built from the vocabulary", () => {
    const key = subjectKeyFor("홍길동");
    const ko = starAliasFor(key, true);
    const en = starAliasFor(key, false);
    expect(starAliasFor(key, true)).toBe(ko);
    expect(STAR_ALIAS_PREFIXES_KO.some((p) => ko.startsWith(`${p} `))).toBe(true);
    expect(STAR_ALIAS_SUFFIXES.some((s) => ko.endsWith(s.ko))).toBe(true);
    expect(STAR_ALIAS_PREFIXES_EN.some((p) => en.startsWith(`${p} `))).toBe(true);
    expect(STAR_ALIAS_SUFFIXES.some((s) => en.endsWith(s.en))).toBe(true);
  });

  test("variants shift the combination (collision probing)", () => {
    const key = subjectKeyFor("홍길동");
    expect(starAliasFor(key, true, 1)).not.toBe(starAliasFor(key, true, 0));
  });
});

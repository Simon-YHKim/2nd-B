// Guards for the Analysis Lexicon v0.1 in src/lib/safety/lexicon.ts.
//
// The lexicon is the launch-blocking gate for Tier-1 jurisdiction risk
// (EU AI Act / GDPR Art.9 / US Practice Acts / FTC §5 / KR 의료법).
// These tests catch regressions before they ship — accidental removal
// of a term, malformed regex, missing jurisdiction.
//
// Sources of truth this test enforces:
//   - docs/legal/lexicon-jurisdiction-matrix.md (per-jurisdiction map)
//   - docs/legal/lexicon-draft-v0.1.md (the actual word lists)
//
// If you legitimately need to change one of these, update the matching
// doc AND this test in the same commit.

import {
  ANALYSIS_UNIVERSAL_FORBIDDEN,
  ANALYSIS_JURISDICTION_FORBIDDEN,
  ANALYSIS_BANNED_CLAIM_PATTERNS,
  LEXICON_VERSION,
  LEXICON_LAST_LEGAL_REVIEW,
  type Jurisdiction,
} from "../lexicon";
import { containsAnalysisForbidden } from "../classifier";

describe("analysis lexicon — universal forbidden", () => {
  test("EN list contains the core IQ/diagnosis terms", () => {
    // These four are the absolute floor — losing any of them re-opens
    // FTC §5 or US Practice Acts risk.
    expect(ANALYSIS_UNIVERSAL_FORBIDDEN.en).toEqual(
      expect.arrayContaining(["IQ score", "diagnose", "psychotherapy", "scientifically proven"]),
    );
  });

  test("KO list contains 의료법 §27 trigger terms", () => {
    // 진단명 / 정신질환 / 심리치료 / 임상심리사 are the KR 의료법
    // Title-Act floor. Losing them is direct legal exposure in KR.
    expect(ANALYSIS_UNIVERSAL_FORBIDDEN.ko).toEqual(
      expect.arrayContaining(["진단명", "정신질환", "심리치료", "임상심리사"]),
    );
  });

  test("EN ↔ KO parity in spirit (both sides have at least 10 terms)", () => {
    // We don't require 1:1 mapping (KR has additional value-judgment
    // terms like 머리 좋은 that don't translate) but each side must
    // be substantial enough to cover the FTC/Practice-Act surface.
    expect(ANALYSIS_UNIVERSAL_FORBIDDEN.en.length).toBeGreaterThanOrEqual(10);
    expect(ANALYSIS_UNIVERSAL_FORBIDDEN.ko.length).toBeGreaterThanOrEqual(10);
  });
});

describe("analysis lexicon — runtime matcher (containsAnalysisForbidden)", () => {
  test("EN: affirmative claims are caught with word boundaries", () => {
    expect(containsAnalysisForbidden("Your IQ score went up!", "en")).toEqual(["IQ score"]);
    expect(containsAnalysisForbidden("This is scientifically proven.", "en")).toEqual([
      "scientifically proven",
    ]);
    // Boundary check: a term embedded inside a longer word does not match.
    expect(containsAnalysisForbidden("misdiagnoses are common", "en")).toEqual([]);
  });

  test("KO: substring matching catches inflected verdict phrasing", () => {
    expect(containsAnalysisForbidden("당신의 지능지수가 올랐습니다", "ko")).toEqual(["지능지수"]);
    expect(containsAnalysisForbidden("임상적으로 검증된 방법입니다", "ko")).toEqual([
      "임상적으로 검증된",
    ]);
  });

  test("clean reflective copy matches nothing in either locale", () => {
    expect(containsAnalysisForbidden("patterns shifted in your records", "en")).toEqual([]);
    expect(containsAnalysisForbidden("기록에서 관찰된 패턴이에요", "ko")).toEqual([]);
  });
});

describe("analysis lexicon — jurisdiction-specific", () => {
  const required: readonly Jurisdiction[] = ["EU", "US", "KR", "JP", "UK", "AU", "CA", "SG"];

  test.each(required)("has a (possibly empty) list for %s", (j) => {
    expect(ANALYSIS_JURISDICTION_FORBIDDEN[j]).toBeDefined();
    expect(Array.isArray(ANALYSIS_JURISDICTION_FORBIDDEN[j])).toBe(true);
  });

  test("EU list flags AI Act emotion-recognition framing", () => {
    // AI Act Annex III §1c — emotion recognition is high-risk.
    // If this term slips into product copy in the EU we trigger
    // high-risk regime + DPIA. Must be banned.
    expect(ANALYSIS_JURISDICTION_FORBIDDEN.EU).toEqual(
      expect.arrayContaining(["emotion recognition", "biometric categorisation"]),
    );
  });

  test("KR list flags 정신건강복지법 §3 protected labels", () => {
    expect(ANALYSIS_JURISDICTION_FORBIDDEN.KR).toEqual(
      expect.arrayContaining(["정신질환자", "정신건강복지센터"]),
    );
  });

  test("JP list flags 公認心理師法 reserved titles", () => {
    expect(ANALYSIS_JURISDICTION_FORBIDDEN.JP).toEqual(
      expect.arrayContaining(["公認心理師", "臨床心理士"]),
    );
  });
});

describe("analysis lexicon — banned claim patterns", () => {
  test("every pattern compiles as a regex", () => {
    for (const { pattern, flags } of ANALYSIS_BANNED_CLAIM_PATTERNS) {
      expect(() => new RegExp(pattern, flags)).not.toThrow();
    }
  });

  test("FTC §5 efficacy template ('proven to increase X') is banned", () => {
    const proven = ANALYSIS_BANNED_CLAIM_PATTERNS.find((p) =>
      p.why.startsWith("FTC §5"),
    );
    expect(proven).toBeDefined();
    if (!proven) return;
    const rx = new RegExp(proven.pattern, proven.flags);
    expect(rx.test("This app is proven to increase your memory")).toBe(true);
    expect(rx.test("This app supports your reflection practice")).toBe(false);
  });

  test("Lumos Labs precedent: '50% increase in IQ' is banned", () => {
    const lumos = ANALYSIS_BANNED_CLAIM_PATTERNS.find((p) =>
      p.pattern.includes("\\d+\\s*%"),
    );
    expect(lumos).toBeDefined();
    if (!lumos) return;
    const rx = new RegExp(lumos.pattern, lumos.flags);
    expect(rx.test("50% increase in IQ within 14 days")).toBe(true);
    expect(rx.test("patterns shifted in your records")).toBe(false);
  });

  test("Practice-Act trigger 'replace your therapist' is banned", () => {
    const sub = ANALYSIS_BANNED_CLAIM_PATTERNS.find((p) =>
      p.why.includes("Practice Acts"),
    );
    expect(sub).toBeDefined();
    if (!sub) return;
    const rx = new RegExp(sub.pattern, sub.flags);
    expect(rx.test("Replace your therapist with 2nd-Brain")).toBe(true);
    expect(rx.test("complement your reflection practice")).toBe(false);
  });

  test("each pattern carries a replacement suggestion", () => {
    for (const p of ANALYSIS_BANNED_CLAIM_PATTERNS) {
      expect(p.replacement.length).toBeGreaterThan(0);
    }
  });
});

describe("analysis lexicon — version + counsel review", () => {
  test("version is exposed", () => {
    expect(LEXICON_VERSION).toBe("0.1");
  });

  test("last legal review field exists (null until counsel signs off)", () => {
    // Counsel review pending — the field is scaffolded so a future CI
    // warning ('lexicon > 365d stale') has a target to compare against.
    expect(LEXICON_LAST_LEGAL_REVIEW === null || typeof LEXICON_LAST_LEGAL_REVIEW === "string").toBe(true);
  });
});

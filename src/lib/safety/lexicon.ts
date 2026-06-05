// Single source of truth for safety-related vocabulary.
// Used by classifier (runtime) and check-forbidden-lexicon.ts (CI).
// Edit here only; downstream consumers must not duplicate.

export type Locale = "en" | "ko";

// Words/phrases that should NOT appear in our product copy, code, or
// migration docs. They are also flagged in user input as a YELLOW zone
// (downgrade + rephrase hint), not a hard block — see classifier.ts.
export const FORBIDDEN_TERMS: Record<Locale, readonly string[]> = {
  en: [
    "mental health",
    "therapy",
    "counseling",
    "diagnosis",
    "treatment",
    "healing",
    "cure",
  ],
  ko: [
    "정신건강",
    "심리치료",
    "심리상담",
    "치유",
  ],
} as const;

// Crisis signals → RED zone. Routes to professional resources;
// never reaches an LLM advisor call. Keep this list conservative;
// false negatives are safer than false positives for crisis routing
// when paired with the hotline UX (user can always close the modal).
export const CRISIS_TERMS: Record<Locale, readonly string[]> = {
  en: [
    "suicide",
    "suicidal",
    "kill myself",
    "end my life",
    "end it all",
    "ending it",
    "self-harm",
    "self harm",
    "cutting myself",
    "want to die",
    "i want to die",
    "no reason to live",
  ],
  ko: [
    // Active RED (Suicide CARE 2.0, Na et al. 2020)
    "자살",
    "죽고 싶",
    "죽고싶",
    "살고 싶지 않",
    "사라지고 싶",
    "더 이상 살",
    "끝내고 싶",
    "끝낼 거",
    "끝낼거",
    "자해",
    "목숨을 끊",
    "스스로 목숨",
    "유서",
    "마지막 인사",
    // Latent RED (Suicide CARE 2.0 §Korean linguistic markers)
    "짐이 되",
    "없어지는 게 나아",
    "사라지는 게 나",
    "다음 생에는",
    "영영 잠들고 싶",
  ],
} as const;

// Hotlines surfaced when CRISIS_TERMS match. Locale-aware.
export const HOTLINES = {
  // KR unified suicide-prevention line. As of 2024-01 the government merged
  // 1393 (자살예방상담전화) and seven other lines into the single 3-digit 109
  // ("한 명(1)의 생명도 자살 없이(0) 구(9)하자"). 109 is the number to publish.
  KR_109: { number: "109", label: "자살예방상담전화" },
  // Legacy lines — kept defined for audit/research history only. NOT selected
  // by routing anymore (109 superseded 1393 in 2024). Never surface to users.
  KR_1393: { number: "1393", label: "자살예방상담전화" },
  KR_1577_0199: { number: "1577-0199", label: "정신건강위기상담전화" },
  // Youth line (Korea, 청소년전화). Age-aware routing adds this for minors
  // (14-17) alongside 109.
  KR_1388: { number: "1388", label: "청소년상담전화" },
  GLOBAL_988: { number: "988", label: "Suicide & Crisis Lifeline (US)" },
} as const;

export type HotlineId = keyof typeof HOTLINES;

// Paths excluded from the forbidden-lexicon CI scan. The lexicon
// file itself and the constraints docs must contain the terms to
// define them. Glob patterns matched against repo-relative paths.
export const LEXICON_SCAN_ALLOWLIST: readonly string[] = [
  "src/lib/safety/lexicon.ts",
  "src/lib/safety/__tests__/**",
  // Government-mandated hotline labels (e.g. "자살예방상담전화"/"정신건강위기상담전화")
  // must use their official names.
  "locales/en/safety.json",
  "locales/ko/safety.json",
  "docs/CONSTRAINTS.md",
  // VISION.md restates the vocabulary policy in a ❌/✅ table so future
  // contributors see it on first read — table entries must be verbatim.
  "docs/VISION.md",
  // gemini-app-overview.md is the prompt-ready spec we hand to an external
  // LLM (Gemini) for world-building / UI consulting. It restates the
  // ❌/✅ vocabulary table verbatim and quotes the LLM's draft phrasing
  // ("위로 패치" etc.) inside an evaluation block — those quotations are
  // policy-definition reference, not user-facing copy.
  "docs/gemini-app-overview.md",
  // safety.ts cites the official Korean hotline name "정신건강위기상담전화"
  // verbatim. Same justification as the locale safety files.
  "src/lib/llm/safety.ts",
  // The landing card carries the mandatory non-clinical disclosure per
  // docs/research/CLAUDE.md §0 rule 5. persona.tsx was rephrased (2026-06-06,
  // Simon decision) to a non-clinical "observed patterns, not a medical
  // assessment" wording that avoids the banned 진단/diagnosis vocab entirely, so
  // it no longer needs an allowlist entry and is scanned like every other surface.
  "src/app/index.tsx",
  // Research artifacts cite academic terms by definition — they ARE the
  // policy reference, not user-facing copy. The user-facing copy in src/
  // and locales/ is still scanned.
  "docs/research/**",
  "docs/handoff/**",
  // Legal & security docs define the policy — they must contain the
  // banned terms verbatim. The user-facing surfaces (src/ + locales/)
  // are still scanned, so this allowlisting doesn't weaken the gate.
  "docs/legal/**",
  "docs/security/**",
  // UX docs (audit reports, mascot diagnostics) cite the lexicon for
  // verification — they reference, not surface.
  "docs/ux/**",
  "supabase/seed/**",
  "db/seed/**",
  "node_modules/**",
  ".expo/**",
  "dist/**",
  "ios/**",
  "android/**",
  "coverage/**",
] as const;

// ════════════════════════════════════════════════════════════════════
// Analysis Lexicon v0.1
// Source of truth: docs/legal/lexicon-jurisdiction-matrix.md
//                + docs/legal/lexicon-draft-v0.1.md
// ════════════════════════════════════════════════════════════════════
//
// New surface: 2nd-Brain's analysis system (Behavior Taxonomy + theory
// frameworks + Voice layer) introduces vocabulary the clinical lexicon
// above does not cover — IQ claims, percentile-without-population,
// diagnosis-shaped verdicts, Title-Act-reserved labels. Without an
// explicit policy these slip into product copy and trigger Tier-1
// jurisdiction risk (EU AI Act, EU GDPR Art.9, US Practice Acts,
// US FTC §5, KR 의료법 §27).
//
// Hard ban — these terms must never appear in user-facing copy in any
// jurisdiction. They are the universal floor. Jurisdiction-specific
// additions are below.
//
// The CI scanner does NOT enforce these lists yet (next PR wires them
// into scripts/check-forbidden-lexicon.ts) — this PR establishes the
// authoritative source so taxonomy / theory matrix / Voice work in
// parallel sessions can reference a stable list.

export const ANALYSIS_UNIVERSAL_FORBIDDEN: Record<Locale, readonly string[]> = {
  en: [
    "IQ score",
    "intelligence quotient",
    "diagnose",
    "diagnosis",
    "psychotherapy",
    "psychological evaluation",
    "psychiatric",
    "mental disorder",
    "scientifically proven",
    "clinically validated",
    "medically approved",
    "you have a disorder",
    "your personality type is",
    "increase your IQ",
    "boost brainpower",
  ],
  ko: [
    "지능지수",
    "아이큐 점수",
    "진단명",
    "정신과적",
    "정신질환",
    "심리치료",
    "심리상담사",
    "임상심리사",
    "당신은 ~한 사람입니다",
    "과학적으로 입증된",
    "임상적으로 검증된",
    "머리 좋은",
    "똑똑한",
    "정상이",
    "비정상이",
    "장애가 있",
    "결함이 있",
    "우월한",
    "열등한",
  ],
} as const;

export type Jurisdiction = "EU" | "US" | "KR" | "JP" | "UK" | "AU" | "CA" | "SG";

// Jurisdiction-specific tripwires. Triggered only when distributing to
// the named market. Universal list covers everywhere; this catches the
// market-specific traps (EU AI Act emotion-recognition framing, KR 의료법
// reserved titles, JP 公認心理師法 title protection, etc.).
export const ANALYSIS_JURISDICTION_FORBIDDEN: Record<Jurisdiction, readonly string[]> = {
  EU: [
    "emotion recognition",
    "emotion detection",
    "affective computing",
    "biometric categorisation",
    "personality assessment for employment",
  ],
  US: [
    "licensed practitioner",
    "clinical evaluation",
    "medical advice",
    "psychologist services",
    "psychological services",
  ],
  KR: [
    "정신건강복지센터",
    "정신질환자",
    "우울증 환자",
    "정신건강의학과",
  ],
  JP: [
    "公認心理師",
    "臨床心理士",
    "精神療法",
  ],
  UK: [
    "psychotherapist",
    "psychiatric assessment",
  ],
  AU: [
    "registered psychologist",
    "AHPRA-registered",
  ],
  CA: [
    "registered psychologist",
    "psychological services",
  ],
  SG: [
    "registered psychologist",
    "medical service",
  ],
} as const;

// Banned claim *shapes* — even with all individual words OK, certain
// templates trigger FTC §5 deception or EU AI Act framing risk. Stored
// as regex sources so the runtime classifier can compile + match.
// Each pattern carries a Voice-safe replacement suggestion.
export const ANALYSIS_BANNED_CLAIM_PATTERNS: ReadonlyArray<{
  pattern: string;
  flags: string;
  why: string;
  replacement: string;
}> = [
  {
    pattern: "\\b(?:proven|guaranteed) to (?:increase|improve|boost|enhance)\\b",
    flags: "i",
    why: "FTC §5: efficacy claims need competent and reliable evidence",
    replacement: "supports your reflection practice",
  },
  {
    pattern: "\\d+\\s*%\\s*(?:increase|improvement) in (?:IQ|memory|focus|intelligence)",
    flags: "i",
    why: "FTC §5: quantified cognitive-outcome claims (Lumos Labs precedent)",
    replacement: "patterns shifted in your records",
  },
  {
    pattern: "clinically validated to",
    flags: "i",
    why: "FTC §5: medical-grade efficacy claim",
    replacement: "based on peer-reviewed frameworks",
  },
  {
    pattern: "replace your (?:therapist|doctor|psychologist|psychiatrist)",
    flags: "i",
    why: "US Practice Acts: implies medical/therapeutic substitution",
    replacement: "complement your reflection practice",
  },
];

// Versioning + counsel-review cadence. CI may compare
// LEXICON_LAST_LEGAL_REVIEW to today and warn when older than 365d
// (next-PR work — scaffold now to make sure the field exists).
export const LEXICON_VERSION = "0.1" as const;
export const LEXICON_LAST_LEGAL_REVIEW: string | null = null; // ISO-8601 date when set by external counsel

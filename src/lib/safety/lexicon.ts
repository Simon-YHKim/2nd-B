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
  KR_1393: { number: "1393", label: "자살예방상담전화" },
  KR_1577_0199: { number: "1577-0199", label: "정신건강위기상담전화" },
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
  // safety.ts cites the official Korean hotline name "정신건강위기상담전화"
  // verbatim. Same justification as the locale safety files.
  "src/lib/llm/safety.ts",
  // Landing + persona cards carry the mandatory "not a diagnosis"
  // disclosure per docs/research/CLAUDE.md §0 rule 5 — the term IS the
  // policy text.
  "src/app/index.tsx",
  "src/app/persona.tsx",
  // Research artifacts cite academic terms by definition — they ARE the
  // policy reference, not user-facing copy. The user-facing copy in src/
  // and locales/ is still scanned.
  "docs/research/**",
  "docs/handoff/**",
  "supabase/seed/**",
  "db/seed/**",
  "node_modules/**",
  ".expo/**",
  "dist/**",
  "ios/**",
  "android/**",
  "coverage/**",
] as const;

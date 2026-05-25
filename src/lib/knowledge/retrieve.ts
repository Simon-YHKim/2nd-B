// Path A retrieval — Karpathy Wiki pattern.
// Per docs/handoff/build-rag-wiki.md §6.3 and docs/research/CLAUDE.md §2 routing table.
//
// Keyword/regex routing identifies 2–4 relevant batches; batch markdown is
// loaded inline; specific rows are pulled from knowledge_sources by
// (framework, locale, age_range). The Advisor system prompt is assembled
// per the §7 template.

import { loadBatch, loadSchema, queryRows } from "./loader";
import type { AgeRange, KnowledgeRow, Locale } from "./types";

export interface RetrieveInput {
  userMessage: string;
  userLocale: Locale;
  userAgeRange?: AgeRange;
  conversationContext?: string;
}

export interface RetrieveResult {
  matchedBatches: string[];
  rows: KnowledgeRow[];
  schemaContext: string;
  assembledPrompt: string;
}

// Keyword → batch routing (mirrors docs/research/CLAUDE.md §2).
// Each entry: a regex (anchored on word/Hangul boundaries where useful)
// plus the slugs to load when matched. The matches are unioned across
// entries, then capped.
interface RoutingEntry {
  pattern: RegExp;
  batches: string[];
}

const ROUTING: RoutingEntry[] = [
  // Crisis — always also loaded as a baseline (see ALWAYS_LOAD).
  {
    pattern: /(suicide|kill myself|end my life|self.?harm|want to die|hopeless|자살|죽고\s*싶|자해|사라지고\s*싶|더\s*이상\s*살|끝내고\s*싶)/i,
    batches: ["crisis-detection"],
  },
  // Burnout / distress
  {
    pattern: /(burnout|exhausted|drained|can.?t keep going|번아웃|지쳤|너무\s*힘들|다\s*그만)/i,
    batches: ["crisis-detection", "cbt-rebt", "self-compassion"],
  },
  // Family / relationships
  {
    pattern: /(family|parents?|mom|dad|sibling|brother|sister|가족|부모님|엄마|아빠|형제|자매|싸움|싸웠)/i,
    batches: ["attachment", "interpersonal"],
  },
  {
    pattern: /(relationship|breakup|partner|dating|ex.?girlfriend|ex.?boyfriend|연애|헤어|이별|남친|여친|배우자)/i,
    batches: ["attachment", "interpersonal"],
  },
  // Career / work
  {
    pattern: /(career|work|job|promotion|quit|일|직장|진로|이직|퇴사|승진)/i,
    batches: ["sdt", "big-five", "assessment-landscape"],
  },
  // Identity / purpose
  {
    pattern: /(identity|who am i|purpose|meaning|정체성|나는\s*누구|의미|목적)/i,
    batches: ["erikson", "via-strengths", "sdt", "values-meaning"],
  },
  // Worry / rumination
  {
    pattern: /(worry|can.?t stop thinking|anxious thoughts|걱정|생각이\s*멈추지\s*않)/i,
    batches: ["cbt-rebt", "self-knowledge"],
  },
  // Habits / motivation
  {
    pattern: /(habit|routine|discipline|motivation|습관|루틴|동기|의지)/i,
    batches: ["sdt", "growth-mindset"],
  },
  // Failure / regret
  {
    pattern: /(failure|regret|mistake|shame|실패|후회|실수|부끄러움)/i,
    batches: ["self-compassion", "cbt-rebt", "growth-mindset"],
  },
  // Growth / change
  {
    pattern: /(growth|change|new direction|성장|변화|새로운\s*시작)/i,
    batches: ["growth-mindset", "sdt", "narrative-identity"],
  },
  // Midlife
  {
    pattern: /(midlife|중년|마흔|쉰|인생\s*정리)/i,
    batches: ["erikson", "soc-successful-aging", "narrative-identity"],
  },
  // Aging
  {
    pattern: /(aging|retirement|parent care|노후|은퇴|부모님\s*돌봄)/i,
    batches: ["soc-successful-aging", "erikson"],
  },
  // "What's my type" / assessments
  {
    pattern: /(personality test|mbti|enneagram|what type|성격검사|엠비티아이|유형)/i,
    batches: ["big-five", "assessment-landscape"],
  },
  // Reflection / self-awareness
  {
    pattern: /(journal|reflection|self.?awareness|일기|성찰|자기이해|자기\s*이해)/i,
    batches: ["self-knowledge"],
  },
];

// Always loaded so the safety rubric is in scope. Capped at the max budget.
const ALWAYS_LOAD = ["crisis-detection"];
const MAX_BATCHES = 4;
const FALLBACK_BATCHES = ["self-knowledge", "sdt", "big-five"];

function routeBatches(userMessage: string): string[] {
  const matched = new Set<string>();
  for (const { pattern, batches } of ROUTING) {
    if (pattern.test(userMessage)) {
      for (const b of batches) matched.add(b);
    }
  }
  for (const b of ALWAYS_LOAD) matched.add(b);
  if (matched.size === 1) {
    // Only ALWAYS_LOAD matched. Add the generic baseline.
    for (const b of FALLBACK_BATCHES) matched.add(b);
  }
  return [...matched].slice(0, MAX_BATCHES);
}

// Map our slugs to the framework strings used in knowledge_sources.
// (Slugs use hyphens, framework values often use underscores.)
const SLUG_TO_FRAMEWORK: Record<string, string[]> = {
  "crisis-detection": ["crisis_detection"],
  "big-five": ["big_five"],
  "assessment-landscape": [
    "assessment_a_hexaco",
    "assessment_a_riasec",
    "assessment_a_values",
    "assessment_b_hpi",
    "assessment_b_birkman",
  ],
  sdt: ["sdt"],
  attachment: ["attachment"],
  interpersonal: ["interpersonal"],
  "cbt-rebt": ["cbt_rebt"],
  "self-compassion": ["self_compassion"],
  "growth-mindset": ["growth_mindset"],
  erikson: ["erikson"],
  "narrative-identity": ["narrative_identity"],
  "values-meaning": ["values_meaning"],
  "via-strengths": ["via_strengths"],
  "self-knowledge": ["self_knowledge"],
  "emerging-adulthood": ["emerging_adulthood"],
  "soc-successful-aging": ["soc_successful_aging"],
  "ai-mental-health-safety": ["ai_mental_health"],
  "data-ethics-consent": ["data_ethics"],
  "computational-personality": ["computational_personality"],
  "methodology-birkman-brain-trinity": ["methodology"],
  "wellbeing-kpi": ["wellbeing_kpi"],
};

function frameworksForBatches(slugs: string[]): string[] {
  const set = new Set<string>();
  for (const s of slugs) for (const f of SLUG_TO_FRAMEWORK[s] ?? []) set.add(f);
  return [...set];
}

export async function retrieveEvidence(input: RetrieveInput): Promise<RetrieveResult> {
  const matchedBatches = routeBatches(input.userMessage);

  // Load batch markdown (only the ones we have on disk/bundled — silently
  // skip missing ones so the system degrades gracefully as new batches land).
  const batchTexts = await Promise.all(
    matchedBatches.map(async (slug) => ({ slug, md: await loadBatch(slug) })),
  );
  const loadedBatchTexts = batchTexts.filter((b) => b.md.length > 0);

  const schemaContext = await loadSchema();

  const rows = await queryRows({
    framework: frameworksForBatches(matchedBatches),
    locale: input.userLocale,
    ageRange: input.userAgeRange,
    limit: 8,
  });

  const assembledPrompt = assembleAdvisorPrompt({
    schemaContext,
    matchedBatches,
    loadedBatchTexts,
    rows,
    userMessage: input.userMessage,
    userLocale: input.userLocale,
    userAgeRange: input.userAgeRange,
    conversationContext: input.conversationContext,
  });

  return { matchedBatches, rows, schemaContext, assembledPrompt };
}

interface AssembleInput {
  schemaContext: string;
  matchedBatches: string[];
  loadedBatchTexts: { slug: string; md: string }[];
  rows: KnowledgeRow[];
  userMessage: string;
  userLocale: Locale;
  userAgeRange?: AgeRange;
  conversationContext?: string;
}

// Per build-rag-wiki §7 prompt template.
function assembleAdvisorPrompt(input: AssembleInput): string {
  const evidenceBlocks = input.rows
    .slice(0, 6)
    .map((r) => {
      const summary = input.userLocale === "ko" ? r.summary_ko : r.summary_en;
      const cite = r.doi ? `DOI ${r.doi}` : r.url ?? "no source link";
      return `- ${r.title}\n    ${cite}\n    ${summary ?? ""}\n    Application: ${r.application_notes ?? "—"}`;
    })
    .join("\n");

  const batchAppendix = input.loadedBatchTexts
    .map(({ slug, md }) => `--- batch:${slug} ---\n${truncate(md, 2500)}`)
    .join("\n\n");

  return [
    `SYSTEM:`,
    `You are 2nd-Brain's Advisor. Ground every response in the curated research below.`,
    `Never make unsupported claims. Never diagnose or claim therapeutic outcomes.`,
    ``,
    `=== HARD SAFETY RULES (verbatim) ===`,
    extractSafetyRulesSection(input.schemaContext),
    ``,
    `=== USER CONTEXT ===`,
    `Locale: ${input.userLocale}`,
    input.userAgeRange ? `Age range: ${input.userAgeRange}` : `Age range: unknown`,
    input.conversationContext ? `Recent themes: ${input.conversationContext}` : `Recent themes: (none)`,
    ``,
    `=== RELEVANT EVIDENCE (knowledge_sources rows) ===`,
    evidenceBlocks || `(no rows matched — respond with mirror + question only)`,
    ``,
    `=== BATCH NOTES (excerpts) ===`,
    batchAppendix || `(no batch markdown available)`,
    ``,
    `=== USER MESSAGE ===`,
    input.userMessage,
    ``,
    `=== YOUR RESPONSE ===`,
    `- Respond in ${input.userLocale}.`,
    `- Reference the user's own words ("you mentioned X" / "당신이 말한 X").`,
    `- Cite at most ONE evidence-based observation, framed as a pattern not a verdict.`,
    `- End with ONE reflective question, not advice.`,
    `- Maximum 4 sentences total. If shorter is better, be shorter.`,
  ].join("\n");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n... [truncated]";
}

// Pull the first hard-safety-rules block from schemaContext (under §0).
// Falls back to the full schema if §0 cannot be located.
function extractSafetyRulesSection(schema: string): string {
  const start = schema.indexOf("## 0.");
  const next = schema.indexOf("## 1.", start === -1 ? 0 : start + 1);
  if (start === -1) return schema.slice(0, 1500);
  if (next === -1) return schema.slice(start);
  return schema.slice(start, next).trim();
}

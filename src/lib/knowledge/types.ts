// Shared types for the knowledge-base layer.
// Mirrors the knowledge_sources table after migrations 0007/0013/0014.

export type Locale = "en" | "ko";
export type ResearchLocale = Locale | "both";
export type AgeRange =
  | "child"
  | "adolescent"
  | "young_adult"
  | "adult"
  | "midlife"
  | "elderly"
  | "lifespan";

export interface KnowledgeRow {
  id: string;
  title: string;
  authors: string[];
  doi: string | null;
  url: string | null;
  framework: string;
  age_range: string;
  locale: ResearchLocale;
  verified_at: string | null;
  summary_ko: string | null;
  summary_en: string | null;
  application_notes: string | null;
}

export interface QueryFilters {
  framework?: string | string[];
  locale?: Locale;
  ageRange?: AgeRange;
  limit?: number;
}

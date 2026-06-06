// Aggregate insights over a user's records. Pure function — caller fetches
// the rows. Powers /insights and the "patterns" surface on the persona card.

export interface InsightRecord {
  id: string;
  created_at: string;
  topic: string | null;
  conclusion: string | null;
  tags: string[];
  body: string;
}

export interface InsightsResult {
  recordCount: number;
  /** Days between the earliest and latest record (inclusive). */
  daySpan: number;
  /** Records per ISO week (last 8 weeks). */
  byWeek: { week: string; count: number }[];
  /** Top tags by frequency. */
  topTags: { tag: string; count: number }[];
  /** Top topics by frequency. */
  topTopics: { topic: string; count: number }[];
  /** Recent conclusions (last 5 with non-empty conclusion). */
  recentConclusions: { conclusion: string; created_at: string }[];
  /** Average body length in chars. */
  avgBodyChars: number;
}

function isoWeek(date: Date): string {
  // ISO 8601 week — Monday-based, week containing the year's first Thursday is week 1.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** A captured Source row. Non-journal Capture modes (memo/link/OCR/file)
 *  persist here instead of `records`, so /insights must include them or it
 *  shows a false-empty state to source-only users (data-truth gate). */
export interface InsightSource {
  id: string;
  captured_at: string;
  title: string | null;
  tags: string[] | null;
}

/** Map a captured Source into the shared InsightRecord shape. Sources carry no
 *  conclusion or distinct body, so title doubles as topic/body. */
export function sourceToInsightRecord(s: InsightSource): InsightRecord {
  const title = s.title && s.title.length > 0 ? s.title : null;
  return {
    id: s.id,
    created_at: s.captured_at,
    topic: title,
    conclusion: null,
    tags: s.tags ?? [],
    body: title ?? "",
  };
}

export function computeInsights(records: InsightRecord[], opts: { tagLimit?: number; topicLimit?: number } = {}): InsightsResult {
  const tagLimit = opts.tagLimit ?? 8;
  const topicLimit = opts.topicLimit ?? 5;

  if (records.length === 0) {
    return {
      recordCount: 0,
      daySpan: 0,
      byWeek: [],
      topTags: [],
      topTopics: [],
      recentConclusions: [],
      avgBodyChars: 0,
    };
  }

  // Sort defensively in case caller passed unsorted.
  const sorted = [...records].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const firstDate = new Date(sorted[0].created_at);
  const lastDate = new Date(sorted[sorted.length - 1].created_at);
  const daySpan = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000) + 1);

  // By-week (last 8 weeks of records).
  const weekCounts = new Map<string, number>();
  for (const r of sorted) {
    const w = isoWeek(new Date(r.created_at));
    weekCounts.set(w, (weekCounts.get(w) ?? 0) + 1);
  }
  const byWeek = [...weekCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([week, count]) => ({ week, count }));

  // Top tags.
  const tagFreq = new Map<string, number>();
  for (const r of sorted) for (const t of r.tags ?? []) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  const topTags = [...tagFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, tagLimit)
    .map(([tag, count]) => ({ tag, count }));

  // Top topics.
  const topicFreq = new Map<string, number>();
  for (const r of sorted) {
    if (r.topic && r.topic.length > 0) topicFreq.set(r.topic, (topicFreq.get(r.topic) ?? 0) + 1);
  }
  const topTopics = [...topicFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topicLimit)
    .map(([topic, count]) => ({ topic, count }));

  // Recent conclusions (last 5 non-empty, newest first).
  const recentConclusions = sorted
    .filter((r) => r.conclusion && r.conclusion.length > 0)
    .slice(-5)
    .reverse()
    .map((r) => ({ conclusion: r.conclusion as string, created_at: r.created_at }));

  const avgBodyChars = Math.round(sorted.reduce((s, r) => s + r.body.length, 0) / sorted.length);

  return {
    recordCount: sorted.length,
    daySpan,
    byWeek,
    topTags,
    topTopics,
    recentConclusions,
    avgBodyChars,
  };
}

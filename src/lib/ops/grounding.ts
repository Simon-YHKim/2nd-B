// Grounding chips — the "why this?" one-liners surfaced on Ops cards/screens
// (ops-ia §4). Pure formatters over data the app already has: the adherence
// signal (A, all domains), the GitHub activity summary and the spending trend
// (B, domain-specific). Locale picked by a boolean (ko) so these stay i18n-free
// and node-testable. Framing stays factual — counts, not judgements.

import type { AdherenceStats } from "./signals";
import type { MonthDelta } from "../finance/trend";
import type { GithubActivitySummary } from "../projects/github";

/** A — adherence: "최근 5/7일 · 연속 3일" / "5/7 days · 3-day streak". */
export function adherenceChip(stats: AdherenceStats, ko: boolean): string {
  return ko
    ? `최근 ${stats.completedDays}/${stats.windowDays}일 · 연속 ${stats.streak}일`
    : `${stats.completedDays}/${stats.windowDays} days · ${stats.streak}-day streak`;
}

/** B — GitHub: "이번 주 24커밋" / "24 commits this week". */
export function githubChip(summary: GithubActivitySummary, ko: boolean): string {
  return ko ? `이번 주 ${summary.commits}커밋` : `${summary.commits} commits this week`;
}

/** B — spending trend: "지출 ↑12%" / "Spending ↓8%". null when flat (nothing to say). */
export function trendChip(delta: MonthDelta, ko: boolean): string | null {
  if (delta.direction === "flat") return null;
  const arrow = delta.direction === "up" ? "↑" : "↓";
  const pct = delta.pct !== null ? `${Math.round(Math.abs(delta.pct) * 100)}%` : "";
  return ko ? `지출 ${arrow}${pct}` : `Spending ${arrow}${pct}`;
}

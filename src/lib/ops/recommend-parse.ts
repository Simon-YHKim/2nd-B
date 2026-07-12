// Pure parsing primitives for ops recommendations, split out of recommend.ts so
// daily-brief.ts can reuse parseOpsRecommendations WITHOUT a require cycle
// (recommend.ts imports buildOpsDailyBrief/getOpsDailyBrief from daily-brief.ts,
// and daily-brief.ts needs the parser — routing both through this leaf module
// breaks the recommend <-> daily-brief cycle). No imports: keep it a leaf.

export interface OpsRecommendation {
  title: string;
  reason: string;
  /** ISO start suggestion; absent when the idea isn't time-bound. */
  startsAtIso?: string;
  durationMinutes?: number;
  recurrence?: "daily" | "weekly";
  checklist?: string[];
}

export const OPS_MAX_RECOMMENDATIONS = 4;
const TITLE_MAX = 80;
const REASON_MAX = 240;
const CHECKLIST_MAX_ITEMS = 7;
const CHECKLIST_ITEM_MAX = 80;

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function clampIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : value;
}

/** Defensive parse of the model reply (JSON array, possibly fenced). */
export function parseOpsRecommendations(raw: string): OpsRecommendation[] {
  const unfenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: OpsRecommendation[] = [];
  for (const item of parsed) {
    if (out.length >= OPS_MAX_RECOMMENDATIONS) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = clampText(row.title, TITLE_MAX);
    const reason = clampText(row.reason, REASON_MAX);
    if (!title || !reason) continue;
    const rec: OpsRecommendation = { title, reason };
    const startsAtIso = clampIso(row.startsAtIso);
    if (startsAtIso) rec.startsAtIso = startsAtIso;
    if (typeof row.durationMinutes === "number" && row.durationMinutes > 0) {
      rec.durationMinutes = Math.min(Math.round(row.durationMinutes), 24 * 60);
    }
    if (row.recurrence === "daily" || row.recurrence === "weekly") rec.recurrence = row.recurrence;
    if (Array.isArray(row.checklist)) {
      const items = row.checklist
        .map((entry) => clampText(entry, CHECKLIST_ITEM_MAX))
        .filter((entry): entry is string => entry !== null)
        .slice(0, CHECKLIST_MAX_ITEMS);
      if (items.length > 0) rec.checklist = items;
    }
    out.push(rec);
  }
  return out;
}

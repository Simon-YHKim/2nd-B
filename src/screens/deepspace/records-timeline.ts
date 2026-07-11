// Pure view-model for the deep-space /records ("기록 보관소") timeline.
// Groups a user's records into KST day buckets (오늘 / 어제 / M월 D일) so the
// screen stays a thin renderer. Tested without rendering or a DB.

import { stripDomainTags } from "../../lib/persona/domain-stars";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RecordKind = "journal" | "note" | "audit_response" | string;

export interface TimelineRecord {
  id: string;
  kind: RecordKind;
  summary?: string | null;
  topic?: string | null;
  body?: string | null;
  tags?: string[] | null;
  created_at: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  timeLabel: string;
  tag?: string;
  dim: boolean;
}

export interface TimelineGroup {
  label: string;
  items: TimelineItem[];
}

/** Other records sharing at least one tag with the focal record, newest first,
 *  excluding the focal record itself. Powers the /record "연결된 기록" section
 *  until a real record-link table exists. */
export function relatedByTag(
  focalId: string,
  focalTags: string[] | null | undefined,
  all: TimelineRecord[],
  max = 5,
): TimelineRecord[] {
  // Ignore the reserved domain: tag: every record carries one, so relating by it
  // would make almost everything "connected" and drown the real tag overlap.
  const tags = new Set(stripDomainTags(focalTags ?? []));
  if (tags.size === 0) return [];
  return all
    .filter((r) => r.id !== focalId && stripDomainTags(r.tags ?? []).some((t) => tags.has(t)))
    .slice(0, max);
}

function kstDayKey(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

export interface TimelineLabels {
  today: string;
  yesterday: string;
  monthDay: (month: number, day: number) => string;
  now: string;
  hoursAgo: (h: number) => string;
  fallbackTitle: string;
}

const KO_TIMELINE: TimelineLabels = {
  today: "오늘",
  yesterday: "어제",
  monthDay: (m, d) => `${m}월 ${d}일`,
  now: "방금",
  hoursAgo: (h) => `${h}시간 전`,
  fallbackTitle: "기록",
};

function firstLine(s: string): string {
  const line = s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line;
}

function titleOf(r: TimelineRecord, fallback: string): string {
  const summary = r.summary?.trim();
  if (summary) return summary.length > 80 ? `${summary.slice(0, 80).trimEnd()}…` : summary;
  const topic = r.topic?.trim();
  if (topic) return topic;
  const body = r.body?.trim();
  if (body) return firstLine(body);
  return fallback;
}

/** "방금" / "N시간 전" for same-day rows; "" otherwise (the group label carries
 *  the day). */
function todayTimeLabel(createdMs: number, nowMs: number, labels: TimelineLabels): string {
  const diffH = Math.floor((nowMs - createdMs) / (60 * 60 * 1000));
  if (diffH <= 0) return labels.now;
  return labels.hoursAgo(diffH);
}

function groupLabel(dayKey: number, todayKey: number, sampleMs: number, labels: TimelineLabels): string {
  if (dayKey === todayKey) return labels.today;
  if (dayKey === todayKey - 1) return labels.yesterday;
  const d = new Date(sampleMs + KST_OFFSET_MS);
  return labels.monthDay(d.getUTCMonth() + 1, d.getUTCDate());
}

export interface BuildTimelineOpts {
  now?: Date;
  maxGroups?: number;
  /** Localized labels; defaults to KO so existing callers/tests are unchanged. */
  labels?: TimelineLabels;
  /**
   * Give non-today items their day label (어제 / M월 D일) instead of "".
   * The grouped timeline view leaves this off - its group headers already carry
   * the date, so a per-item copy would be redundant. The flat records LIST has
   * no group headers, so without this every older row lost its time entirely
   * (the reference shows a time on every row).
   */
  labelEveryItem?: boolean;
}

export function buildRecordsTimeline(
  records: TimelineRecord[],
  opts: BuildTimelineOpts = {},
): TimelineGroup[] {
  const nowMs = (opts.now ?? new Date()).getTime();
  const todayKey = kstDayKey(nowMs);
  const maxGroups = opts.maxGroups ?? 8;
  const labels = opts.labels ?? KO_TIMELINE;

  // Preserve input order (listRecentRecords returns newest-first) within each
  // bucket; Map keeps first-seen key order, which is newest day first.
  const buckets = new Map<number, TimelineRecord[]>();
  for (const r of records) {
    const ms = new Date(r.created_at).getTime();
    if (Number.isNaN(ms)) continue;
    const key = kstDayKey(ms);
    const arr = buckets.get(key);
    if (arr) arr.push(r);
    else buckets.set(key, [r]);
  }

  const groups: TimelineGroup[] = [];
  for (const [dayKey, rows] of buckets) {
    if (groups.length >= maxGroups) break;
    const isToday = dayKey === todayKey;
    const sampleMs = new Date(rows[0].created_at).getTime();
    groups.push({
      label: groupLabel(dayKey, todayKey, sampleMs, labels),
      items: rows.map((r) => {
        const ms = new Date(r.created_at).getTime();
        // First USER tag (the domain: tag rides on every record and isn't a chip).
        const visibleTags = stripDomainTags(r.tags ?? []);
        const tag = visibleTags.length > 0 ? `#${visibleTags[0]}` : undefined;
        return {
          id: r.id,
          title: titleOf(r, labels.fallbackTitle),
          timeLabel: isToday
            ? todayTimeLabel(ms, nowMs, labels)
            : opts.labelEveryItem
              ? groupLabel(dayKey, todayKey, ms, labels)
              : "",
          tag,
          dim: !isToday,
        };
      }),
    });
  }
  return groups;
}

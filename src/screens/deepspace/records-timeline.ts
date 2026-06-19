// Pure view-model for the deep-space /records ("기록 보관소") timeline.
// Groups a user's records into KST day buckets (오늘 / 어제 / M월 D일) so the
// screen stays a thin renderer. Tested without rendering or a DB.

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
  icon: string;
  title: string;
  timeLabel: string;
  tag?: string;
  dim: boolean;
}

export interface TimelineGroup {
  label: string;
  items: TimelineItem[];
}

const KIND_ICON: Record<string, string> = {
  journal: "✎",
  note: "📝",
  audit_response: "🧭",
};

function kstDayKey(ms: number): number {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

function firstLine(s: string): string {
  const line = s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line;
}

function titleOf(r: TimelineRecord): string {
  const summary = r.summary?.trim();
  if (summary) return summary.length > 80 ? `${summary.slice(0, 80).trimEnd()}…` : summary;
  const topic = r.topic?.trim();
  if (topic) return topic;
  const body = r.body?.trim();
  if (body) return firstLine(body);
  return "기록";
}

/** "방금" / "N시간 전" for same-day rows; "" otherwise (the group label carries
 *  the day). */
function todayTimeLabel(createdMs: number, nowMs: number): string {
  const diffH = Math.floor((nowMs - createdMs) / (60 * 60 * 1000));
  if (diffH <= 0) return "방금";
  return `${diffH}시간 전`;
}

function groupLabel(dayKey: number, todayKey: number, sampleMs: number): string {
  if (dayKey === todayKey) return "오늘";
  if (dayKey === todayKey - 1) return "어제";
  const d = new Date(sampleMs + KST_OFFSET_MS);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export interface BuildTimelineOpts {
  now?: Date;
  maxGroups?: number;
}

export function buildRecordsTimeline(
  records: TimelineRecord[],
  opts: BuildTimelineOpts = {},
): TimelineGroup[] {
  const nowMs = (opts.now ?? new Date()).getTime();
  const todayKey = kstDayKey(nowMs);
  const maxGroups = opts.maxGroups ?? 8;

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
      label: groupLabel(dayKey, todayKey, sampleMs),
      items: rows.map((r) => {
        const ms = new Date(r.created_at).getTime();
        const tag = r.tags && r.tags.length > 0 ? `#${r.tags[0]}` : undefined;
        return {
          id: r.id,
          icon: KIND_ICON[r.kind] ?? "•",
          title: titleOf(r),
          timeLabel: isToday ? todayTimeLabel(ms, nowMs) : "",
          tag,
          dim: !isToday,
        };
      }),
    });
  }
  return groups;
}

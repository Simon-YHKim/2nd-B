// Apple Health export.xml parser (personal-data import, 🟠 건강 민감).
//
// The live path (HealthKit) is native + legal-gated. The gate-free path is the
// user's own Health app "내보내기" → export.xml, which contains:
//   <Record type="HKQuantityTypeIdentifierStepCount" startDate="2024-01-05 08:00:00 +0900"
//           value="120" unit="count"/>
// This pure parser reads that file — no network, no LLM, no storage. The caller
// persists only DERIVED summaries (per-type totals), never the full record set.

export interface HealthRecord {
  /** short type, e.g. "StepCount" (HKQuantityTypeIdentifier stripped). */
  type: string;
  startIso: string | null;
  value: number;
  unit: string;
}

const MAX_RECORDS = 50000;
const TYPES_CAP = 40;

function shortType(raw: string): string {
  return raw.replace(/^HK(Quantity|Category)TypeIdentifier/, "");
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/** "2024-01-05 08:00:00 +0900" → ISO. Returns null when unparseable. */
export function parseAppleDate(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(value.trim());
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, date, time, tzh, tzm] = m;
  const d = new Date(`${date}T${time}${tzh}:${tzm}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse an Apple Health export.xml into typed records. Pure. */
export function parseAppleHealthExport(raw: string): HealthRecord[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const out: HealthRecord[] = [];
  const tagRe = /<Record\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(raw)) !== null) {
    if (out.length >= MAX_RECORDS) break;
    const tag = m[0];
    const type = attr(tag, "type");
    const valueStr = attr(tag, "value");
    if (!type || valueStr === null) continue;
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue; // category records w/o numeric value are skipped
    out.push({
      type: shortType(type),
      startIso: parseAppleDate(attr(tag, "startDate")),
      value,
      unit: attr(tag, "unit") ?? "",
    });
  }
  return out;
}

export interface HealthSummary {
  records: number;
  /** per-type numeric totals, descending. */
  byType: Array<{ type: string; total: number; unit: string }>;
}

/** Pure: per-type totals — the derived summary the caller may persist. */
export function summarizeHealth(records: ReadonlyArray<HealthRecord>): HealthSummary {
  const totals = new Map<string, { total: number; unit: string }>();
  for (const r of records) {
    const prev = totals.get(r.type);
    if (prev) prev.total += r.value;
    else if (totals.size < TYPES_CAP) totals.set(r.type, { total: r.value, unit: r.unit });
  }
  const byType = [...totals.entries()]
    .map(([type, v]) => ({ type, total: v.total, unit: v.unit }))
    .sort((a, b) => b.total - a.total);
  return { records: records.length, byType };
}

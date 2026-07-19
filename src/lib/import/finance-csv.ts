// Bank/card statement CSV parser (P1 조건부 -- docs/
// integrations-feasibility_260717.html §4: 재정 ★★★, ops_ledger 직결).
//
// LEGAL BOUNDARY (spec): manual file upload ONLY -- the user downloads the
// statement from their own bank/card portal and hands us the file (일반 §15
// 동의; 마이데이터 허가 불필요). Direct account connections and scraping are
// absolutely forbidden (허가제 침범) and must never be built on top of this.
//
// Pure on-device transform: no network, no LLM, no storage. Parsing only
// PROPOSES rows; nothing persists until the user ratifies, and then only the
// chosen rows enter ops_ledger (0052) via ledger-ratify.ts. The raw file is
// never retained.
//
// Korean institutions ship wildly different CSV layouts, so this maps the
// common column vocabularies instead of one bank's format:
//   date    거래일시/거래일자/거래일/이용일/승인일/사용일/날짜/일자/date ...
//   amount  split 출금·입금 columns, or one signed/unsigned 금액/amount column
//   label   가맹점명/거래내용/적요/내용/상호/사용처/memo/description ...
// Rows the parser cannot read with confidence are counted in `skipped`
// (honesty counter -- the review screen can say "N건은 읽지 못했습니다").

export interface FinanceTxn {
  /** Booking date, normalized to YYYY-MM-DD. */
  occurredOn: string;
  kind: "income" | "expense";
  /** Positive whole KRW (ops_ledger amount_krw semantics). */
  amountKrw: number;
  /** Merchant / description cell, clamped. */
  label: string;
}

export interface FinanceCsvResult {
  txns: FinanceTxn[];
  /** Data rows that could not be confidently read (bad date/amount). */
  skipped: number;
}

const MAX_ROWS = 5_000;
const LABEL_MAX = 80;
const AMOUNT_MAX = 1_000_000_000_000; // one trillion KRW sanity ceiling

const DATE_COLS = [
  "거래일시", "거래일자", "거래일", "이용일시", "이용일자", "이용일",
  "승인일시", "승인일자", "승인일", "사용일", "매출일", "일시", "일자", "날짜", "date",
];
const SIGNED_AMOUNT_COLS = ["거래금액", "승인금액", "이용금액", "결제금액", "출금입금", "금액", "amount"];
const OUT_COLS = ["출금액", "출금금액", "출금", "지급금액", "지급액", "인출", "withdrawal", "debit"];
const IN_COLS = ["입금액", "입금금액", "입금", "예입", "deposit", "credit"];
const LABEL_COLS = [
  "가맹점명", "가맹점", "거래내용", "거래처", "사용처", "상호", "적요", "내용",
  "받는분", "보낸분", "비고", "메모", "description", "merchant", "memo",
];
const DIRECTION_COLS = ["거래구분", "입출구분", "구분", "type"];

/** Header-row sniff shared with detect.ts: a date column AND an amount shape. */
export function looksLikeFinanceCsvHeader(head: string): boolean {
  const lines = head.split(/\r?\n/).slice(0, 10);
  for (const line of lines) {
    const cells = splitCsvLine(line, pickDelimiter(line)).map(normalizeHeader);
    if (cells.length < 2) continue;
    const hasDate = cells.some((c) => DATE_COLS.some((k) => c.includes(k)));
    const hasAmount =
      cells.some((c) => SIGNED_AMOUNT_COLS.some((k) => c.includes(k))) ||
      (cells.some((c) => OUT_COLS.some((k) => c.includes(k))) &&
        cells.some((c) => IN_COLS.some((k) => c.includes(k))));
    if (hasDate && hasAmount) return true;
  }
  return false;
}

function normalizeHeader(cell: string): string {
  return cell.replace(/["'\s()\[\]]/g, "").toLowerCase();
}

function pickDelimiter(line: string): string {
  const counts: Array<[string, number]> = [
    [",", (line.match(/,/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Minimal quoted-field CSV line splitter ("1,234" stays one cell). */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** "2024-01-05", "2024.1.5", "2024/01/05", "20240105" (+optional time) → YYYY-MM-DD. */
function parseDateCell(cell: string): string | null {
  const t = cell.trim();
  let m = /^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/.exec(t);
  if (!m) m = /^(\d{4})(\d{2})(\d{2})(?:\D|$)/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1,234", "₩1,234", "1234원", "(1,234)", "-1,234" → signed integer or null. */
function parseAmountCell(cell: string): number | null {
  let t = cell.replace(/["'₩\s]/g, "").replace(/(krw|원)$/i, "");
  if (t.length === 0) return null;
  let negative = false;
  const paren = /^\((.+)\)$/.exec(t);
  if (paren) {
    negative = true;
    t = paren[1];
  }
  if (t.startsWith("-")) {
    negative = true;
    t = t.slice(1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t.replace(/,/g, "")));
  if (!Number.isFinite(n) || n > AMOUNT_MAX) return null;
  return negative ? -n : n;
}

function findCol(headers: string[], keywords: string[]): number {
  for (const k of keywords) {
    const idx = headers.findIndex((h) => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse a bank/card statement CSV into ledger-ready transactions.
 *
 * Direction rules (deterministic, documented for the review screen):
 *   1. Split 출금/입금 columns -> per-row direction (both filled = skipped).
 *   2. One amount column, any negative value in the file -> signed semantics
 *      (negative = expense, positive = income; typical bank app exports).
 *   3. One amount column, all non-negative -> a 구분 column saying 입금/deposit
 *      marks income; every other row is an expense (card-statement default).
 */
export function parseFinanceCsv(content: string): FinanceCsvResult {
  const allLines = (content ?? "").split(/\r?\n/);
  // Institutions often prepend preamble lines (조회기간 etc.) -- find the header.
  let headerIdx = -1;
  let delim = ",";
  let headers: string[] = [];
  for (let i = 0; i < Math.min(allLines.length, 10); i++) {
    const d = pickDelimiter(allLines[i]);
    const cells = splitCsvLine(allLines[i], d).map(normalizeHeader);
    if (cells.length < 2) continue;
    const hasDate = cells.some((c) => DATE_COLS.some((k) => c.includes(k)));
    const hasAmount =
      cells.some((c) => SIGNED_AMOUNT_COLS.some((k) => c.includes(k))) ||
      (cells.some((c) => OUT_COLS.some((k) => c.includes(k))) && cells.some((c) => IN_COLS.some((k) => c.includes(k))));
    if (hasDate && hasAmount) {
      headerIdx = i;
      delim = d;
      headers = cells;
      break;
    }
  }
  if (headerIdx < 0) return { txns: [], skipped: 0 };

  const dateCol = findCol(headers, DATE_COLS);
  const outCol = findCol(headers, OUT_COLS);
  const inCol = findCol(headers, IN_COLS);
  // 금액-family keywords also live inside 출금액/입금액, so only use the signed
  // column when the split pair is absent.
  const signedCol = outCol >= 0 && inCol >= 0 ? -1 : findCol(headers, SIGNED_AMOUNT_COLS);
  const labelCol = findCol(headers, LABEL_COLS);
  const dirCol = findCol(headers, DIRECTION_COLS);
  if (dateCol < 0 || (signedCol < 0 && (outCol < 0 || inCol < 0))) return { txns: [], skipped: 0 };

  interface RawRow {
    occurredOn: string;
    label: string;
    out: number | null;
    inn: number | null;
    signed: number | null;
    dir: string;
  }
  const rows: RawRow[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < allLines.length && rows.length < MAX_ROWS; i++) {
    if (allLines[i].trim().length === 0) continue;
    const cells = splitCsvLine(allLines[i], delim);
    if (cells.length < 2) continue;
    const occurredOn = dateCol < cells.length ? parseDateCell(cells[dateCol]) : null;
    if (!occurredOn) {
      skipped++;
      continue;
    }
    rows.push({
      occurredOn,
      label: (labelCol >= 0 && labelCol < cells.length ? cells[labelCol] : "").slice(0, LABEL_MAX),
      out: outCol >= 0 && outCol < cells.length ? parseAmountCell(cells[outCol]) : null,
      inn: inCol >= 0 && inCol < cells.length ? parseAmountCell(cells[inCol]) : null,
      signed: signedCol >= 0 && signedCol < cells.length ? parseAmountCell(cells[signedCol]) : null,
      dir: dirCol >= 0 && dirCol < cells.length ? cells[dirCol] : "",
    });
  }

  const anyNegative = rows.some((r) => (r.signed ?? 0) < 0);
  const txns: FinanceTxn[] = [];
  for (const r of rows) {
    let kind: FinanceTxn["kind"] | null = null;
    let amount: number | null = null;
    if (outCol >= 0 && inCol >= 0) {
      const out = r.out ?? 0;
      const inn = r.inn ?? 0;
      if (out > 0 && inn > 0) {
        skipped++; // ambiguous row -- refuse to guess
        continue;
      }
      if (out > 0) {
        kind = "expense";
        amount = out;
      } else if (inn > 0) {
        kind = "income";
        amount = inn;
      }
    } else if (r.signed !== null && r.signed !== 0) {
      if (anyNegative) {
        kind = r.signed < 0 ? "expense" : "income";
      } else {
        kind = /입금|deposit|credit/i.test(r.dir) ? "income" : "expense";
      }
      amount = Math.abs(r.signed);
    }
    if (kind === null || amount === null || amount <= 0) {
      skipped++;
      continue;
    }
    txns.push({ occurredOn: r.occurredOn, kind, amountKrw: amount, label: r.label });
  }
  return { txns, skipped };
}

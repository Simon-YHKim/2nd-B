// Import file-type detection (personal-data import). Pure: given a filename +
// content, decide which parser to route to. The future import hub uses this to
// pick the right parser automatically; no network, no LLM.

import { looksLikeFinanceCsvHeader } from "./finance-csv";

export type ImportKind =
  | "kakao"
  | "sms"
  | "ics"
  | "takeout-location"
  | "apple-health"
  | "email"
  | "markdown"
  | "youtube-history"
  | "finance-csv"
  | "unknown";

const KAKAO_HEADER = /\d{4}년 \d{1,2}월 \d{1,2}일 (오전|오후) \d{1,2}:\d{2},/;

/** Best-effort routing. Content sniffing wins over the extension. Pure. */
export function detectImportKind(filename: string, content: string): ImportKind {
  const name = (filename ?? "").toLowerCase();
  const head = (content ?? "").slice(0, 4000);

  if (/begin:vcalendar/i.test(head) || name.endsWith(".ics")) return "ics";
  if (/<healthdata\b/i.test(head) || /hk(quantity|category)typeidentifier/i.test(head)) return "apple-health";
  if (/<smses\b/i.test(head) || /<sms\b/i.test(head)) return "sms";

  const trimmed = head.trimStart();
  if (trimmed.startsWith("{") && /"(timelineObjects|locations)"\s*:/.test(head)) return "takeout-location";

  // Takeout watch-history.json: a top-level ARRAY of records with header
  // "YouTube" / youtube.com titleUrls (P1 -- youtube.ts).
  if (
    trimmed.startsWith("[") &&
    (/"header"\s*:\s*"YouTube/.test(head) || /youtube\.com\//.test(head) || name.includes("watch-history"))
  ) {
    return "youtube-history";
  }

  if (/카카오톡 대화/.test(head) || KAKAO_HEADER.test(head)) return "kakao";

  if (name.endsWith(".eml") || (/^from:/im.test(head) && /^subject:/im.test(head))) return "email";

  // Bank/card statement CSV: header row with a date column AND an amount
  // shape (signed column or 출금/입금 pair). Deliberately conservative so a
  // random CSV (e.g. Netflix "Title,Date") stays "unknown" instead of being
  // mis-fed into the ledger path (P1 조건부 -- finance-csv.ts).
  if (looksLikeFinanceCsvHeader(head)) return "finance-csv";

  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";

  return "unknown";
}

// Import file-type detection (personal-data import). Pure: given a filename +
// content, decide which parser to route to. The future import hub uses this to
// pick the right parser automatically; no network, no LLM.

export type ImportKind =
  | "kakao"
  | "sms"
  | "ics"
  | "takeout-location"
  | "apple-health"
  | "email"
  | "markdown"
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

  if (/카카오톡 대화/.test(head) || KAKAO_HEADER.test(head)) return "kakao";

  if (name.endsWith(".eml") || (/^from:/im.test(head) && /^subject:/im.test(head))) return "email";

  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";

  return "unknown";
}

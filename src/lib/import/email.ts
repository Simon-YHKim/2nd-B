// Email (.eml) parser (personal-data import, 🟠 이메일).
//
// Covers the past-requested email source via the gate-free path: the user
// exports/forwards a message (.eml) and we read it. Pure: no network, no LLM, no
// storage — RFC 5322 header unfolding + a from/subject/date/body split. The
// caller persists only derived signals, never the full body ("원문 비보존").

import { looksLikeAppointment } from "./hints";

export interface EmailMessage {
  from: string;
  subject: string;
  dateIso: string | null;
  text: string;
}

const TEXT_MAX = 4000;

/** RFC 5322 header unfolding: a leading space/tab continues the previous header. */
function unfoldHeaders(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += ` ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Parse a single .eml message, or null when it has no headers. Pure. */
export function parseEml(raw: string): EmailMessage | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const lines = raw.split(/\r?\n/);
  const blank = lines.findIndex((l) => l.trim() === "");
  const headerLines = unfoldHeaders(blank === -1 ? lines : lines.slice(0, blank));
  const body = blank === -1 ? "" : lines.slice(blank + 1).join("\n");

  const headers = new Map<string, string>();
  for (const line of headerLines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, line.slice(idx + 1).trim());
  }
  if (headers.size === 0) return null;

  const dateRaw = headers.get("date");
  let dateIso: string | null = null;
  if (dateRaw) {
    const d = new Date(dateRaw);
    dateIso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return {
    from: headers.get("from") ?? "",
    subject: headers.get("subject") ?? "",
    dateIso,
    text: body.trim().slice(0, TEXT_MAX),
  };
}

/** Derived signal: does the email (subject + body) look like a plan/appointment? */
export function emailLooksLikeAppointment(email: EmailMessage): boolean {
  return looksLikeAppointment(`${email.subject}\n${email.text}`);
}

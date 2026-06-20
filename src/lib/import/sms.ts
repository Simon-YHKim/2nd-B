// SMS backup parser (personal-data import, 🔴 통신 최민감).
//
// iOS forbids reading SMS entirely and Android's READ_SMS is Play-restricted to
// default-SMS apps, so there is no live path. The viable route is a user backup
// file — the de-facto format is "SMS Backup & Restore" XML:
//   <sms address="010..." date="1704430920000" type="1|2" body="..." />
// (type 1 = received/inbox, 2 = sent). This pure parser reads that file; no
// network, no LLM, no storage. The caller persists only DERIVED signals
// (appointment hints), never the raw bodies ("원문 비보존").

import { looksLikeAppointment } from "./hints";

export type SmsDirection = "received" | "sent";

export interface SmsMessage {
  atIso: string | null;
  address: string;
  direction: SmsDirection;
  text: string;
}

const MAX_MESSAGES = 20000;
const TEXT_MAX = 2000;

function attr(tag: string, name: string): string | null {
  // matches name="..." or name='...'
  const re = new RegExp(`${name}="([^"]*)"|${name}='([^']*)'`);
  const m = re.exec(tag);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").trim();
}

// Minimal XML-entity decode for the body text (no DOM in RN).
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function isoFromEpochMs(value: string | null): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const d = new Date(Number(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse an "SMS Backup & Restore" XML export into messages. Pure. */
export function parseSmsBackup(raw: string): SmsMessage[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const out: SmsMessage[] = [];
  const tagRe = /<sms\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(raw)) !== null) {
    if (out.length >= MAX_MESSAGES) break;
    const tag = m[0];
    const body = attr(tag, "body");
    if (body === null) continue;
    const address = attr(tag, "address") ?? "";
    const type = attr(tag, "type");
    out.push({
      atIso: isoFromEpochMs(attr(tag, "date")),
      address,
      direction: type === "2" ? "sent" : "received",
      text: decodeEntities(body).slice(0, TEXT_MAX),
    });
  }
  return out;
}

export interface SmsAppointmentHint {
  atIso: string | null;
  address: string;
  text: string;
}

/** Derived signal: SMS that look like a plan/appointment. The caller persists only this. */
export function extractSmsAppointmentHints(messages: ReadonlyArray<SmsMessage>, max = 50): SmsAppointmentHint[] {
  const out: SmsAppointmentHint[] = [];
  for (const m of messages) {
    if (out.length >= max) break;
    if (looksLikeAppointment(m.text)) {
      out.push({ atIso: m.atIso, address: m.address, text: m.text.slice(0, 140) });
    }
  }
  return out;
}

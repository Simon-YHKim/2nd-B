// Import propose-builder (import-hub propose→ratify). Pure: runs the on-device
// parsers and turns a parsed file into a list of DERIVED proposals + a summary
// the user reviews and ratifies. No network, no LLM, no storage — raw bodies are
// never returned, only derived signals ("원문 비보존"). Sensitive proposals are
// flagged so the screen can default-exclude them.

import type { ImportKind } from "./detect";
import { aggregateRelationSignals, extractAppointmentHints, parseKakaoExport, type KakaoRelationSignal } from "./kakao";
import { extractSmsAppointmentHints, parseSmsBackup } from "./sms";
import { parseTakeoutLocations, summarizeLocations } from "./location";
import { parseIcs } from "./ics";
import { parseAppleHealthExport, summarizeHealth } from "./health-export";
import { emailLooksLikeAppointment, parseEml } from "./email";

export interface ImportProposal {
  id: string;
  label: string;
  /** the routing hint, e.g. "약속 → 캘린더 후보". */
  sub: string;
  /** sensitive proposals (health, comms) are default-excluded in the UI. */
  sensitive: boolean;
}

export interface ImportSummary {
  appointments: number;
  places: number;
  events: number;
  health: number;
  /** always 0 — raw bodies are never retained. Shown for transparency. */
  raw: 0;
}

export interface ImportOutcome {
  proposals: ImportProposal[];
  summary: ImportSummary;
  /**
   * kakao only (연동 P0③): pseudonymous per-person frequency/recency signals
   * (subjectKey, never a name — see kakao.ts). The hub upserts these into
   * relation_people as star aliases AFTER the user ratifies the import.
   */
  relationSignals?: KakaoRelationSignal[];
}

const PROPOSAL_CAP = 100;
const empty: ImportSummary = { appointments: 0, places: 0, events: 0, health: 0, raw: 0 };

/** Pure: parse `content` per `kind` and build derived proposals + summary. */
export function buildProposals(kind: ImportKind, content: string): ImportOutcome {
  const proposals: ImportProposal[] = [];
  const summary: ImportSummary = { ...empty };

  let relationSignals: KakaoRelationSignal[] | undefined;
  if (kind === "kakao") {
    const messages = parseKakaoExport(content);
    const hints = extractAppointmentHints(messages);
    summary.appointments = hints.length;
    for (const h of hints) proposals.push({ id: `kakao-${proposals.length}`, label: h.text, sub: "약속 → 캘린더 후보", sensitive: true });
    relationSignals = aggregateRelationSignals(messages);
  } else if (kind === "sms") {
    const hints = extractSmsAppointmentHints(parseSmsBackup(content));
    summary.appointments = hints.length;
    for (const h of hints) proposals.push({ id: `sms-${proposals.length}`, label: h.text, sub: "약속 → 캘린더 후보", sensitive: true });
  } else if (kind === "takeout-location") {
    const s = summarizeLocations(parseTakeoutLocations(safeJson(content)));
    summary.places = s.places.length;
    for (const p of s.places) proposals.push({ id: `loc-${proposals.length}`, label: p, sub: "장소 → 생활 패턴", sensitive: true });
  } else if (kind === "ics") {
    const events = parseIcs(content);
    summary.events = events.length;
    for (const e of events) proposals.push({ id: `ics-${proposals.length}`, label: e.title, sub: "일정 → 캘린더", sensitive: false });
  } else if (kind === "apple-health") {
    const s = summarizeHealth(parseAppleHealthExport(content));
    summary.health = s.byType.length;
    for (const t of s.byType) proposals.push({ id: `hk-${proposals.length}`, label: `${t.type} ${Math.round(t.total)}${t.unit}`, sub: "건강 → 루틴 자동완료", sensitive: true });
  } else if (kind === "email") {
    const email = parseEml(content);
    if (email && emailLooksLikeAppointment(email)) {
      summary.appointments = 1;
      proposals.push({ id: "email-0", label: email.subject || email.from, sub: "약속 → 캘린더 후보", sensitive: false });
    }
  }

  return {
    proposals: proposals.slice(0, PROPOSAL_CAP),
    summary,
    ...(relationSignals && relationSignals.length > 0 ? { relationSignals } : {}),
  };
}

function safeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Render the ratified proposals as a markdown note (fed to captureFromMarkdown). */
export function proposalsToMarkdown(sourceName: string, chosen: ReadonlyArray<ImportProposal>): string {
  const lines = [`# ${sourceName} 가져오기`, "", ...chosen.map((p) => `- ${p.label} _(${p.sub})_`)];
  return lines.join("\n");
}

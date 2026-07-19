// Import propose-builder (import-hub propose→ratify). Pure: runs the on-device
// parsers and turns a parsed file into a list of DERIVED proposals + a summary
// the user reviews and ratifies. No network, no LLM, no storage — raw bodies are
// never returned, only derived signals ("원문 비보존"). Sensitive proposals are
// flagged so the screen can default-exclude them.

import i18next from "i18next";

import { systemLocaleFor, type SystemLocale } from "@/lib/i18n/locales";
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
  /**
   * markdown (Notion·Obsidian) only: the note section imported verbatim on
   * ratify. Notes are the user's OWN authored content — bringing the text in
   * is the entire point of a notes import, unlike comms/location where only
   * derived signals may be kept.
   */
  body?: string;
}

export interface ImportSummary {
  appointments: number;
  places: number;
  events: number;
  health: number;
  /** markdown note sections found (Notion·Obsidian export). */
  notes: number;
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
const NOTE_BODY_MAX = 4000;
const empty: ImportSummary = { appointments: 0, places: 0, events: 0, health: 0, notes: 0, raw: 0 };

/**
 * Split a markdown export into per-note sections at #/##/### headings. Content
 * before the first heading becomes its own section titled by its first line.
 * Pure; bodies clamped so one giant note can't blow up the review screen.
 */
export function splitMarkdownSections(content: string): Array<{ title: string; body: string }> {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = /^#{1,3}\s+(.+)$/.exec(line);
    if (heading) {
      current = { title: heading[1].trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      if (line.trim().length === 0) continue;
      // Headingless preamble: its first line doubles as the section title.
      current = { title: line.trim().slice(0, 80), body: [] };
      sections.push(current);
      continue;
    }
    current.body.push(line);
  }
  return sections
    .map((s) => ({ title: s.title, body: s.body.join("\n").trim().slice(0, NOTE_BODY_MAX) }))
    .filter((s) => s.title.length > 0);
}

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
  } else if (kind === "markdown") {
    // Notion·Obsidian notes (2026-07-18 QA: this kind previously had NO branch,
    // so every notes import died on "0 proposals" — a dead end the hub
    // advertised as working). Each heading section becomes one proposal whose
    // body imports verbatim on ratify.
    const sections = splitMarkdownSections(content);
    summary.notes = sections.length;
    for (const s of sections) {
      proposals.push({ id: `md-${proposals.length}`, label: s.title, sub: "노트 → 기록", sensitive: false, body: s.body });
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

/** Render the ratified proposals as a markdown note (fed to captureFromMarkdown).
 *  Signal-only proposals render as bullets (derived, 원문 비보존); note proposals
 *  (markdown import) carry their body and render as full sections. */
/**
 * Markdown note body for the ratified import (the H1 becomes the note title).
 * Locale-aware since dispatch 260719 S1-5 (HANDOFF queue D): the heading used
 * to be KO-fixed ("... 가져오기") even for EN-locale users. Callers may pass
 * the locale explicitly; omitted, it follows the current app language
 * (systemLocaleFor collapses every non-KO tag to "en", and an uninitialized
 * i18next -- e.g. under jest -- reads as "en" too).
 */
export function proposalsToMarkdown(
  sourceName: string,
  chosen: ReadonlyArray<ImportProposal>,
  locale: SystemLocale = systemLocaleFor(i18next.language),
): string {
  const lines = [locale === "ko" ? `# ${sourceName} 가져오기` : `# ${sourceName} import`, ""];
  for (const p of chosen) {
    if (p.body) {
      lines.push(`## ${p.label}`, "", p.body, "");
    } else {
      lines.push(`- ${p.label} _(${p.sub})_`);
    }
  }
  return lines.join("\n");
}

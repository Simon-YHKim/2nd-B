// Import propose-builder (import-hub propose→ratify). Pure: runs the on-device
// parsers and turns a parsed file into a list of DERIVED proposals + a summary
// the user reviews and ratifies. No network, no LLM, no storage — raw bodies are
// never returned, only derived signals ("원문 비보존"). Sensitive proposals are
// flagged so the screen can default-exclude them.

import i18next from "i18next";

import enImport from "../../../locales/en/import.json";
import koImport from "../../../locales/ko/import.json";
import { systemLocaleFor, type SystemLocale } from "@/lib/i18n/locales";
import type { ImportKind } from "./detect";
import { aggregateRelationSignals, countAppointmentHints, parseKakaoExport, type KakaoRelationSignal } from "./kakao";
import { countSmsAppointmentHints, parseSmsBackup } from "./sms";
import { parseTakeoutLocations, summarizeLocations } from "./location";
import { eventWhen } from "./event-when";
import { parseIcs, type CalendarEvent } from "./ics";
import { parseAppleHealthExport, summarizeHealth } from "./health-export";
import { emailLooksLikeAppointment, parseEml } from "./email";
import { parseFinanceCsv, type FinanceTxn } from "./finance-csv";
import { parseYouTubeWatchHistory, summarizeWatchHistory } from "./youtube";

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
  /**
   * finance-csv only (P1): the ops_ledger row this proposal ratifies into.
   * Riding ON the proposal (not the outcome) keeps the user's per-row
   * check/uncheck authoritative — ledger-ratify.ts inserts exactly the chosen
   * ones, mirroring the #1075 relation-alias "propose, then persist" law.
   */
  ledgerEntry?: FinanceTxn;
  /**
   * Health measurements (Apple Health totals): kept as the person's record but never sent to
   * an AI provider (lib/wiki/ai-exclusion.ts). proposalsToMarkdown marks the source with it.
   */
  aiExcluded?: "health_measurements";
  /**
   * Comms/location imports (KakaoTalk, SMS, Google Takeout location) are locked for minor
   * accounts. The hub screen checks the age before ratify; this mark rides into the source's
   * frontmatter (`import_kind`) so the database can refuse the row too (0223). A tampered
   * client can still drop the mark, so this backs up an honest client that loses its own
   * check, the same posture as 0094 for relation_people.
   */
  lockedImport?: MinorLockedImportKind;
}

/** Import kinds whose results a minor account never holds (0094 relation_people, 0223 sources). */
export type MinorLockedImportKind = "kakao" | "sms" | "takeout-location";
export const MINOR_LOCKED_IMPORT_KINDS: ReadonlySet<ImportKind> = new Set<ImportKind>(["kakao", "sms", "takeout-location"]);

/** The frontmatter key 0223 reads. Kept beside the kind list so the two cannot drift. */
export const IMPORT_KIND_FRONTMATTER_KEY = "import_kind";

/** The routing line of an Apple Health measurement; ai-exclusion.ts recognises older imports by it. */
export const HEALTH_PROPOSAL_SUB = "건강 → 루틴 자동완료";

export interface ImportSummary {
  appointments: number;
  places: number;
  events: number;
  health: number;
  /** markdown note sections found (Notion·Obsidian export). */
  notes: number;
  /** youtube-history: non-ad watch events found (P1). */
  watches: number;
  /** finance-csv: readable statement rows found (P1). */
  transactions: number;
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
const empty: ImportSummary = { appointments: 0, places: 0, events: 0, health: 0, notes: 0, watches: 0, transactions: 0, raw: 0 };

/** "1234567" -> "1,234,567" without Intl (Hermes/node parity). */
function formatKrw(n: number): string {
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

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
export function buildProposals(kind: ImportKind, content: string, localeTag: string = i18next.language ?? "en"): ImportOutcome {
  const proposals: ImportProposal[] = [];
  const summary: ImportSummary = { ...empty };

  let relationSignals: KakaoRelationSignal[] | undefined;
  if (kind === "kakao") {
    const messages = parseKakaoExport(content);
    summary.appointments = countAppointmentHints(messages);
    if (summary.appointments > 0) proposals.push(appointmentCountProposal("kakao", summary.appointments, localeTag));
    relationSignals = aggregateRelationSignals(messages);
  } else if (kind === "sms") {
    summary.appointments = countSmsAppointmentHints(parseSmsBackup(content));
    if (summary.appointments > 0) proposals.push(appointmentCountProposal("sms", summary.appointments, localeTag));
  } else if (kind === "takeout-location") {
    const s = summarizeLocations(parseTakeoutLocations(safeJson(content)));
    summary.places = s.places.length;
    for (const p of s.places) proposals.push({ id: `loc-${proposals.length}`, label: p, sub: "장소 → 생활 패턴", sensitive: true });
  } else if (kind === "ics") {
    const events = parseIcs(content);
    summary.events = events.length;
    proposals.push(...calendarEventProposals(events));
  } else if (kind === "apple-health") {
    const s = summarizeHealth(parseAppleHealthExport(content));
    summary.health = s.byType.length;
    for (const t of s.byType) proposals.push({ id: `hk-${proposals.length}`, label: `${t.type} ${Math.round(t.total)}${t.unit}`, sub: HEALTH_PROPOSAL_SUB, sensitive: true, aiExcluded: "health_measurements" });
  } else if (kind === "email") {
    const email = parseEml(content);
    if (email && emailLooksLikeAppointment(email)) {
      summary.appointments = 1;
      // 라벨은 **제목만** 쓴다. 예전에는 `email.subject || email.from` 이라,
      // 제목 없는 메일이면 상대방 이메일 주소가 라벨이 되어 그대로 sources 에
      // 저장됐다. 상대방은 우리 사용자가 아니고 동의한 적도 없다.
      //
      // sensitive: true 인 이유는 두 가지다. 하나는 이 제안이 **제3자 정보**를
      // 품고 있다는 것이고, 다른 하나는 임포트 화면이 이미 이메일 타일을
      // tier "sensitive" 로 선언해놨다는 것이다 - 화면은 민감하다고 하면서
      // 제안은 기본 선택이던 불일치를 맞춘다.
      // (ImportHubScreen 이 `!p.sensitive` 인 것만 기본 선택한다.)
      proposals.push({
        id: "email-0",
        label: email.subject?.trim() || "제목 없는 메일",
        sub: "약속 → 캘린더 후보",
        sensitive: true,
      });
    }
  } else if (kind === "youtube-history") {
    // P1: derived signals only — channel-level interest counts + one rhythm
    // line. Individual video titles are never proposed (원문 비보존).
    const yt = summarizeWatchHistory(parseYouTubeWatchHistory(safeJson(content)));
    summary.watches = yt.total;
    if (yt.total > 0) {
      const monthsSpanned = Math.max(1, yt.months.length);
      proposals.push({
        id: "yt-rhythm",
        label: `최근 ${monthsSpanned}개월 ${yt.total}회 시청`,
        sub: "시청 리듬 → 휴식 패턴",
        sensitive: false,
      });
    }
    for (const c of yt.channels) {
      proposals.push({ id: `yt-${proposals.length}`, label: `${c.name} · ${c.count}회`, sub: "채널 → 관심사(성장·휴식)", sensitive: false });
    }
  } else if (kind === "finance-csv") {
    // P1 조건부: each readable statement row proposes one ops_ledger entry
    // (재정 별 직결). Sensitive => default-excluded until the user opts rows
    // in; nothing persists before ratify, and only chosen rows do.
    const parsed = parseFinanceCsv(content);
    summary.transactions = parsed.txns.length;
    for (const txn of parsed.txns) {
      proposals.push({
        id: `fin-${proposals.length}`,
        label: `${txn.occurredOn} ${txn.label || "(내용 없음)"} ${formatKrw(txn.amountKrw)}`,
        sub: txn.kind === "income" ? "입금 → 재정 원장" : "지출 → 재정 원장",
        sensitive: true,
        ledgerEntry: txn,
      });
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

  const lockedKind = MINOR_LOCKED_IMPORT_KINDS.has(kind) ? (kind as MinorLockedImportKind) : null;
  return {
    proposals: proposals.slice(0, PROPOSAL_CAP).map((p) => (lockedKind ? { ...p, lockedImport: lockedKind } : p)),
    summary,
    ...(relationSignals && relationSignals.length > 0 ? { relationSignals } : {}),
  };
}

/**
 * One review row per calendar event, its time in front of its title. Shared by .ics files,
 * Google Calendar (which arrives as .ics text) and the phone calendar (phone-calendar.ts).
 */
export function calendarEventProposals(events: ReadonlyArray<CalendarEvent>): ImportProposal[] {
  return events.map((event, i) => {
    const when = eventWhen(event);
    return { id: `ics-${i}`, label: when ? `${when} ${event.title}` : event.title, sub: "일정 → 캘린더", sensitive: false };
  });
}

/** The import outcome for events that arrive as data rather than as a file (the phone calendar). */
export function calendarEventsOutcome(events: ReadonlyArray<CalendarEvent>): ImportOutcome {
  return {
    proposals: calendarEventProposals(events).slice(0, PROPOSAL_CAP),
    summary: { ...empty, events: events.length },
  };
}

/** One ratifiable derived count; no message body, sender, phone number or timestamp. */
function appointmentCountProposal(kind: "kakao" | "sms", count: number, localeTag: string): ImportProposal {
  const copy = systemLocaleFor(localeTag) === "ko" ? koImport.appointmentCount : enImport.appointmentCount;
  const translated = i18next.isInitialized && i18next.exists("appointmentCount.label", { ns: "import", lng: localeTag });
  return {
    id: `${kind}-count`,
    label: translated
      ? i18next.t("appointmentCount.label", { ns: "import", lng: localeTag, count })
      : copy.label.replace("{{count}}", String(count)),
    sub: translated
      ? i18next.t("appointmentCount.sub", { ns: "import", lng: localeTag })
      : copy.sub,
    sensitive: true,
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
  // ai_excluded is AI_EXCLUDED_KEY in lib/wiki/ai-exclusion.ts (not imported: that module imports this one).
  const fields: string[] = [];
  if (chosen.some((p) => p.aiExcluded)) fields.push("ai_excluded: health_measurements");
  const locked = chosen.find((p) => p.lockedImport)?.lockedImport;
  if (locked) fields.push(`${IMPORT_KIND_FRONTMATTER_KEY}: ${locked}`);
  const mark = fields.length > 0 ? ["---", ...fields, "---"] : [];
  const lines = [...mark, locale === "ko" ? `# ${sourceName} 가져오기` : `# ${sourceName} import`, ""];
  for (const p of chosen) {
    if (p.body) {
      lines.push(`## ${p.label}`, "", p.body, "");
    } else {
      lines.push(`- ${p.label} _(${p.sub})_`);
    }
  }
  return lines.join("\n");
}

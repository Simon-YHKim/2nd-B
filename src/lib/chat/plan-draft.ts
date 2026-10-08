import { OPS_DOMAIN_IDS, type OpsDomainId } from "../ops/domains";
import type { OpsEventInput } from "../ops/push";
import type { OpsRecommendation } from "../ops/recommend-parse";

export interface ChatPlanDraft {
  kind: "routine" | "reminder";
  title: string;
  recurrence: "daily" | "weekly";
  weekday: number | null;
  date: string;
  time: string;
  domainId: OpsDomainId;
  exportConsent: boolean;
}

export type ChatPlanValidation = "title" | "date" | "time" | "weekday" | "exportConsent" | "past" | "category";
export interface ChatPlanBuildOptions { now?: Date; requireExportConsent?: boolean }
export type BuiltChatPlan =
  | { ok: false; validation: ChatPlanValidation }
  | { ok: true; draft: ChatPlanDraft; event: OpsEventInput | null; recommendation: OpsRecommendation | null };

const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (value: number) => String(value).padStart(2, "0");
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Date constructor normalization must not silently change a day or a DST-gap time. */
function localMoment(date: string, time: string): { start: Date } | { validation: "date" | "time" } {
  const match = DATE.exec(date);
  if (!match) return { validation: "date" };
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return { validation: "date" };
  const start = new Date(0);
  start.setHours(12, 0, 0, 0);
  start.setFullYear(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return { validation: "date" };
  const [hour, minute] = time.split(":").map(Number);
  start.setHours(hour, minute, 0, 0);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day
    || start.getHours() !== hour || start.getMinutes() !== minute) return { validation: "time" };
  return { start };
}

function nextRoutineStart(draft: ChatPlanDraft, now: Date): { start: Date } | { validation: "date" | "time" } {
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  const weekly = draft.recurrence === "weekly";
  const offset = weekly ? ((draft.weekday! - day.getDay() + 7) % 7) : 0;
  const [hour, minute] = draft.time.split(":").map(Number);
  const passedToday = offset === 0 && hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
  day.setDate(day.getDate() + offset + (passedToday ? (weekly ? 7 : 1) : 0));
  return localMoment(localDate(day), draft.time);
}

/** Builds only reviewed fields. Creating a suggestion or editing this draft never saves. */
export function buildChatPlan(input: ChatPlanDraft, { now = new Date(), requireExportConsent = false }: ChatPlanBuildOptions = {}): BuiltChatPlan {
  if (!input || typeof input.title !== "string") return { ok: false, validation: "title" };
  const title = input.title.trim();
  if (!title || title.length > 80 || Array.from(title).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return { ok: false, validation: "title" };
  if (!OPS_DOMAIN_IDS.includes(input.domainId) || !["routine", "reminder"].includes(input.kind)
    || !["daily", "weekly"].includes(input.recurrence)) return { ok: false, validation: "category" };
  if (typeof input.time !== "string") return { ok: false, validation: "time" };
  const time = input.time.trim();
  if ((input.kind === "reminder" || time !== "") && !CLOCK.test(time)) return { ok: false, validation: "time" };
  if (input.kind === "routine" && input.recurrence === "weekly"
    && (input.weekday === null || !Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6)) return { ok: false, validation: "weekday" };
  if (!Number.isFinite(now.getTime())) return { ok: false, validation: "date" };
  if (input.kind === "reminder" && requireExportConsent && input.exportConsent !== true) return { ok: false, validation: "exportConsent" };
  const draft: ChatPlanDraft = {
    kind: input.kind, title, recurrence: input.recurrence,
    weekday: input.kind === "routine" && input.recurrence === "weekly" ? input.weekday : null,
    date: input.kind === "reminder" && typeof input.date === "string" ? input.date.trim() : "",
    time, domainId: input.domainId, exportConsent: input.exportConsent === true,
  };
  let start: Date | undefined;
  if (draft.kind === "reminder" || time) {
    const result = draft.kind === "reminder" ? localMoment(draft.date, time) : nextRoutineStart(draft, now);
    if ("validation" in result) return { ok: false, validation: result.validation };
    start = result.start;
    if (draft.kind === "reminder" && start.getTime() <= now.getTime()) return { ok: false, validation: "past" };
  }
  const event: OpsEventInput | null = start ? {
    title, startsAtIso: start.toISOString(), ...(draft.kind === "routine" ? { recurrence: draft.recurrence } : {}),
  } : null;
  const recommendation: OpsRecommendation | null = draft.kind === "routine" ? {
    title, reason: "", recurrence: draft.recurrence, ...(start ? { startsAtIso: start.toISOString() } : {}),
  } : null;
  return { ok: true, draft, event, recommendation };
}

export function validateChatPlanDraft(draft: ChatPlanDraft, options: ChatPlanBuildOptions = {}): ChatPlanValidation | null {
  const result = buildChatPlan(draft, options);
  return result.ok ? null : result.validation;
}

// Reads the phone's calendar for the calendar import (Simon 2026-10-02, Q-261001-01 = B:
// "읽은 일정을 기록·위키에 저장한다"). The events go through the same review and save path
// as an .ics file (calendarEventsOutcome in ./proposals), so consent recording, dedupe,
// withdrawal and the retention purge stay what they are for the other calendar imports.
//
// Off while PHONE_CALENDAR_READ_ENABLED is false (./phone-calendar-gate): every entry point
// answers "off" or null and never touches the SDK.
//
// Never prompts on its own. phoneCalendarStatus() and readPhoneCalendar() only check; the
// one call that can show the OS dialog is requestPhoneCalendarAccess(), for an explicit tap.
// Opening a screen must not raise a permission prompt.
//
// Keeps the least: title, start, end and all-day. Notes, attendees, organizer, location and
// alarms are dropped here, before anything leaves this module: attendees and notes carry
// other people's details, and the .ics import keeps the same four fields.
//
// Native only. The SDK is reached through the ../ops/calendar-sdk seam, whose web side
// answers null, so the web bundle never carries expo-calendar.
import { loadExpoCalendar, type ExpoCalendarModule } from "../ops/calendar-sdk";
import type { CalendarEvent } from "./ics";
import { PHONE_CALENDAR_READ_ENABLED } from "./phone-calendar-gate";

export type PhoneCalendarStatus = "off" | "unavailable" | "undetermined" | "blocked" | "granted";

export interface PhoneCalendar {
  id: string;
  title: string;
}

export interface PhoneCalendarRead {
  events: CalendarEvent[];
  /** False when a calendar could not be read or the event cap cut the list. */
  complete: boolean;
}

const TITLE_MAX = 200;
/** A window is meant to be days long; more than this many events is not a normal day. */
export const PHONE_CALENDAR_EVENT_CAP = 500;

// The few calls used, described structurally so a change in the SDK's own types shows up
// here and nowhere else.
interface PermissionLike {
  granted: boolean;
  status?: string;
  canAskAgain?: boolean;
}
interface EventLike {
  title?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  allDay?: boolean | null;
  status?: string | null;
}
interface CalendarLike {
  id: string;
  title?: string | null;
  isVisible?: boolean | null;
  listEvents(startDate: Date, endDate: Date): Promise<EventLike[]>;
}
interface CalendarSdk {
  getCalendarPermissions(writeOnly?: boolean): Promise<PermissionLike>;
  requestCalendarPermissions(writeOnly?: boolean): Promise<PermissionLike>;
  getCalendars(entityType?: string): Promise<CalendarLike[]>;
  EntityTypes: { EVENT: string };
  EventStatus: { CANCELED: string };
}

function isReactNativeRuntime(): boolean {
  const nav = globalThis.navigator as { product?: string } | undefined;
  return nav?.product === "ReactNative";
}

function sdk(): CalendarSdk | null {
  if (!isReactNativeRuntime()) return null;
  const loaded: ExpoCalendarModule | null = loadExpoCalendar();
  if (!loaded) return null;
  const candidate = loaded as unknown as Partial<CalendarSdk>;
  return typeof candidate.getCalendarPermissions === "function" &&
    typeof candidate.requestCalendarPermissions === "function" &&
    typeof candidate.getCalendars === "function"
    ? (candidate as CalendarSdk)
    : null;
}

function statusOf(permission: PermissionLike): PhoneCalendarStatus {
  if (permission.granted) return "granted";
  return permission.status === "denied" && permission.canAskAgain === false ? "blocked" : "undetermined";
}

/** Whether the calendar can be read right now. Shows nothing. */
export async function phoneCalendarStatus(): Promise<PhoneCalendarStatus> {
  if (!PHONE_CALENDAR_READ_ENABLED) return "off";
  const calendar = sdk();
  if (!calendar) return "unavailable";
  try {
    // No argument: full access. On iOS the write-only grant used by the routine hand-off
    // reads as not granted here, which is what a reader needs.
    return statusOf(await calendar.getCalendarPermissions());
  } catch {
    return "unavailable";
  }
}

/** The one call that may show the OS permission dialog. Only for an explicit tap. */
export async function requestPhoneCalendarAccess(): Promise<PhoneCalendarStatus> {
  if (!PHONE_CALENDAR_READ_ENABLED) return "off";
  const calendar = sdk();
  if (!calendar) return "unavailable";
  try {
    return statusOf(await calendar.requestCalendarPermissions());
  } catch {
    return "unavailable";
  }
}

async function visibleCalendars(calendar: CalendarSdk): Promise<CalendarLike[]> {
  const all = await calendar.getCalendars(calendar.EntityTypes.EVENT);
  return all.filter((entry) => entry.isVisible !== false);
}

/** The calendars the person can choose to read. Null when access is not granted. */
export async function listPhoneCalendars(): Promise<PhoneCalendar[] | null> {
  if ((await phoneCalendarStatus()) !== "granted") return null;
  const calendar = sdk();
  if (!calendar) return null;
  try {
    return (await visibleCalendars(calendar)).map((entry) => ({ id: entry.id, title: (entry.title ?? "").trim() }));
  } catch {
    return null;
  }
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toEvent(raw: EventLike, canceled: string): CalendarEvent | null {
  if (raw.status === canceled) return null;
  const title = (raw.title ?? "").trim().slice(0, TITLE_MAX);
  const startIso = toIso(raw.startDate);
  if (!title || !startIso) return null;
  return { title, startIso, endIso: toIso(raw.endDate), allDay: raw.allDay === true };
}

/**
 * Events between `start` and `end`, oldest first, from the chosen calendars (all visible
 * ones when none are chosen). Null when access is not granted: it never asks. Recurring
 * events arrive as one event per occurrence (Android reads the occurrence table).
 */
export async function readPhoneCalendar(
  range: { start: Date; end: Date },
  calendarIds?: readonly string[],
): Promise<PhoneCalendarRead | null> {
  if ((await phoneCalendarStatus()) !== "granted") return null;
  const calendar = sdk();
  if (!calendar) return null;
  let calendars: CalendarLike[];
  try {
    calendars = await visibleCalendars(calendar);
  } catch {
    return null;
  }
  if (calendarIds && calendarIds.length > 0) calendars = calendars.filter((entry) => calendarIds.includes(entry.id));
  const events: CalendarEvent[] = [];
  let complete = true;
  for (const entry of calendars) {
    let raw: EventLike[];
    try {
      // Per calendar: the module-wide listEvents runs an extra reminders query per event.
      raw = await entry.listEvents(range.start, range.end);
    } catch {
      complete = false;
      continue;
    }
    for (const item of raw) {
      const event = toEvent(item, calendar.EventStatus.CANCELED);
      if (event) events.push(event);
    }
  }
  events.sort((a, b) => (a.startIso ?? "").localeCompare(b.startIso ?? "") || a.title.localeCompare(b.title));
  if (events.length > PHONE_CALENDAR_EVENT_CAP) {
    events.length = PHONE_CALENDAR_EVENT_CAP;
    complete = false;
  }
  return { events, complete };
}

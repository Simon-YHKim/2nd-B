import type { Slot } from "./contract";
import { dashboardParam } from "../sufficiency/registry";

export interface DailyNotePlanInput {
  readonly now: Date;
  readonly timeZone: string;
  readonly trigger: "hourly" | "open";
  readonly llmConsent: boolean;
  readonly lastActiveAt: Date | null;
  readonly morningPush: boolean;
  /** Atomic server quota and claims must still be checked after this preflight. */
  readonly attemptsToday: number;
  readonly claimedSlotKeys: readonly string[];
}

export type DailyNotePlan =
  | { readonly kind: "generate"; readonly slot: Slot; readonly localDate: string; readonly slotKey: string }
  | { readonly kind: "skip"; readonly reason: "invalid_input" | "consent_off" | "daily_limit" |
      "outside_slot_hour" | "inactive" | "already_claimed" };

const SLOT_HOURS: readonly [Slot, number][] = [
  ["morning", dashboardParam("dash.P-02", "morningHour")],
  ["midday", dashboardParam("dash.P-02", "middayHour")],
  ["evening", dashboardParam("dash.P-02", "eveningHour")],
];
const DAY_MS = 86_400_000;
const INACTIVE_MS = dashboardParam("dash.P-02", "inactiveSkipDays") * DAY_MS;

/** W1 preflight only. Does not reserve quota or call a model. */
export function planDailyNote(input: DailyNotePlanInput): DailyNotePlan {
  const invalid: DailyNotePlan = { kind: "skip", reason: "invalid_input" };
  if (!input || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) ||
      typeof input.timeZone !== "string" || !input.timeZone.trim() ||
      !["hourly", "open"].includes(input.trigger) || typeof input.llmConsent !== "boolean" ||
      typeof input.morningPush !== "boolean" || !Number.isInteger(input.attemptsToday) || input.attemptsToday < 0 ||
      !Array.isArray(input.claimedSlotKeys) || !input.claimedSlotKeys.every((key) => typeof key === "string")) {
    return invalid;
  }
  const lastActive = input.lastActiveAt === null ? null :
    input.lastActiveAt instanceof Date ? input.lastActiveAt.getTime() : Number.NaN;
  if (lastActive !== null && (!Number.isFinite(lastActive) || lastActive > input.now.getTime())) return invalid;
  if (!input.llmConsent) return { kind: "skip", reason: "consent_off" };
  if (input.attemptsToday >= SLOT_HOURS.length) return { kind: "skip", reason: "daily_limit" };

  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: input.timeZone, calendar: "iso8601", numberingSystem: "latn",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(input.now).map((part) => [part.type, part.value]));
  } catch {
    return invalid;
  }
  const hour = Number(parts.hour);
  const localDate = [parts.year, parts.month, parts.day].join("-");
  const selected = [...SLOT_HOURS].reverse().find(([, startsAt]) => hour >= startsAt);
  const slot = selected?.[0] ?? "evening";
  if (input.trigger === "hourly") {
    // A UTC hourly tick reaches 06:30/06:45 in fractional-offset zones.
    // Only that local hour qualifies; opening is the separate current-slot path.
    if (!SLOT_HOURS.some(([, startsAt]) => hour === startsAt)) {
      return { kind: "skip", reason: "outside_slot_hour" };
    }
    if (!input.morningPush && (lastActive === null || input.now.getTime() - lastActive >= INACTIVE_MS)) {
      return { kind: "skip", reason: "inactive" };
    }
  }
  // The 20:00 slot lasts across midnight. Reopening at 01:00 must not mint it twice.
  const slotDate = selected ? localDate :
    new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1)).toISOString().slice(0, 10);
  const slotKey = slotDate + ":" + slot;
  if (input.claimedSlotKeys.includes(slotKey)) return { kind: "skip", reason: "already_claimed" };
  return { kind: "generate", slot, localDate, slotKey };
}

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { OPS_DOMAIN_IDS } from "../../ops/domains";
import { buildChatPlan, validateChatPlanDraft, type ChatPlanDraft } from "../plan-draft";

const now = new Date(2026, 9, 9, 10, 0); // Friday, local clock in every test timezone.
const draft = (patch: Partial<ChatPlanDraft> = {}): ChatPlanDraft => ({
  kind: "routine", title: "Walk outside", recurrence: "daily", weekday: null,
  date: "", time: "", domainId: "exercise_routine", exportConsent: false, ...patch,
});

test("a weekly routine without an alarm retains its reviewed weekday and ignores date", () => {
  const result = buildChatPlan(draft({ recurrence: "weekly", weekday: 2, date: "not-used" }), { now });
  expect(result).toEqual({ ok: true, draft: draft({ recurrence: "weekly", weekday: 2 }), event: null,
    recommendation: { title: "Walk outside", reason: "", recurrence: "weekly" } });
});

test("daily and weekly clock plans use the next local occurrence without preserving stale dates", () => {
  const daily = buildChatPlan(draft({ time: " 09:15 ", date: "1999-01-01" }), { now });
  const weekly = buildChatPlan(draft({ recurrence: "weekly", weekday: 5, time: "09:15" }), { now });
  expect(daily.ok && daily.event?.startsAtIso).toBe(new Date(2026, 9, 10, 9, 15).toISOString());
  expect(weekly.ok && weekly.event?.startsAtIso).toBe(new Date(2026, 9, 16, 9, 15).toISOString());
  const tomorrow = buildChatPlan(draft({ recurrence: "weekly", weekday: 6, time: "11:00" }), { now });
  expect(tomorrow.ok && tomorrow.event?.startsAtIso).toBe(new Date(2026, 9, 10, 11).toISOString());
});

test("reminders never inherit recurrence or private fields from their source object", () => {
  const result = buildChatPlan({ ...draft({ kind: "reminder", date: "2026-10-10", time: "12:00" }),
    description: "private conversation", promptText: "private source" } as ChatPlanDraft, { now });
  expect(result.ok && result.event).toEqual({ title: "Walk outside", startsAtIso: new Date(2026, 9, 10, 12).toISOString() });
  expect(result.ok && result.recommendation).toBeNull();
  expect(result.ok && result.draft).not.toHaveProperty("promptText");
});

test.each(["", "   ", "a".repeat(81), "first\nsecond", "a\rb"])("invalid title %j is refused", title => {
  expect(validateChatPlanDraft(draft({ title }), { now })).toBe("title");
});

test("title and domain validation do not silently truncate or accept unknown categories", () => {
  expect(validateChatPlanDraft(draft({ title: "a".repeat(80) }), { now })).toBeNull();
  for (const domainId of OPS_DOMAIN_IDS) expect(validateChatPlanDraft(draft({ domainId }), { now })).toBeNull();
  expect(validateChatPlanDraft(draft({ domainId: "unknown" as never }), { now })).toBe("category");
});

test.each([null, -1, 7, 1.5, Number.NaN])("weekly day %s is invalid even without a time", weekday => {
  expect(validateChatPlanDraft(draft({ recurrence: "weekly", weekday }), { now })).toBe("weekday");
});

test.each(["24:00", "09:60", "9:30", "00:0", "12:01:02", "bad"])("invalid local time %s is refused", time => {
  expect(validateChatPlanDraft(draft({ time }), { now })).toBe("time");
});

test.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-01", "2026-10-32", "2026-1-9", ""])("date normalization cannot accept %s", date => {
  expect(validateChatPlanDraft(draft({ kind: "reminder", date, time: "12:00" }), { now })).toBe("date");
});

test("only future one-off dates pass and export consent is explicit and scoped to reminders", () => {
  expect(validateChatPlanDraft(draft({ kind: "reminder", date: "2026-10-09", time: "10:00" }), { now })).toBe("past");
  expect(validateChatPlanDraft(draft({ kind: "reminder", date: "2026-10-09", time: "09:59" }), { now })).toBe("past");
  expect(validateChatPlanDraft(draft({ kind: "reminder", date: "2028-02-29", time: "12:00" }), { now })).toBeNull();
  const reminder = draft({ kind: "reminder", date: "2026-10-10", time: "12:00" });
  expect(validateChatPlanDraft(reminder, { now, requireExportConsent: true })).toBe("exportConsent");
  expect(validateChatPlanDraft({ ...reminder, exportConsent: true }, { now, requireExportConsent: true })).toBeNull();
  expect(validateChatPlanDraft(draft(), { now, requireExportConsent: true })).toBeNull();
});

test("a real local DST gap is rejected instead of silently moving the reminder one hour", () => {
  const source = readFileSync(resolve(__dirname, "../plan-draft.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const code = `const out={}; new Function('require','exports',${JSON.stringify(js)})(()=>({OPS_DOMAIN_IDS:['exercise_routine']}),out);
    const d=${JSON.stringify(draft({ kind: "reminder", date: "2027-03-14", time: "02:30" }))};
    const gap=out.validateChatPlanDraft(d,{now:new Date(2027,2,13,10)});
    const routine=out.buildChatPlan({...d,kind:'routine'},{now:new Date(2027,2,14,3,30)});
    process.stdout.write(JSON.stringify({gap,next:routine.ok&&routine.event.startsAtIso,expected:new Date(2027,2,15,2,30).toISOString()}));`;
  const output = execFileSync(process.execPath, ["-e", code], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" });
  const result = JSON.parse(output);
  expect(result.gap).toBe("time");
  expect(result.next).toBe(result.expected);
});

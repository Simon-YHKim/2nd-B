import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { SevenStarId } from "../../persona/seven-stars";
import type { OpsRoutine } from "../../ops/routines";

const mockRows = new Map<unknown, Record<string, unknown>>();
let mockLoseResponse = false;
const mockListSelect = jest.fn();
const mockUpsert = jest.fn((row: Record<string, unknown>) => ({
  select: () => ({ single: async () => {
    mockRows.set(row.id, row);
    if (mockLoseResponse) {
      mockLoseResponse = false;
      throw new Error("lost response after commit");
    }
    return { data: { ...row, created_at: "2026-10-11T00:00:00Z" }, error: null };
  } }),
}));
jest.mock("../../supabase/client", () => ({ getSupabaseClient: () => ({ from: () => ({
  upsert: mockUpsert, select: mockListSelect,
}) }) }));

let session: typeof import("../routine-save");
let account: typeof import("../../auth/account-epoch");
let routines: typeof import("../../ops/routines");
function startProcess() {
  // Fresh module singletons simulate process death without a production reset API.
  jest.isolateModules(() => {
    session = require("../routine-save");
    account = require("../../auth/account-epoch");
    routines = require("../../ops/routines");
  });
  account.noteResolvedOwner("owner-a");
}
beforeEach(() => { jest.clearAllMocks(); mockRows.clear(); mockLoseResponse = false; startProcess(); });
function switchOwner(owner: string | null) {
  account.beginAccountOwnerTransition(owner);
  account.noteResolvedOwner(owner);
  account.clearAccountTransition(account.currentAccountEpoch());
}

test("R2260-01 same account and step retain a random UUID within the process session", () => {
  const first = session.weeklyGrowthSessionRoutineId("owner-a", "work");
  expect(session.weeklyGrowthSessionRoutineId("owner-a", "work")).toBe(first);
});

test("all seven steps and another account have independent UUIDs accepted by the real save validator", async () => {
  const steps: SevenStarId[] = ["profile", "infancy", "school", "twenties", "later", "work", "now"];
  const ids: string[] = [];
  for (const owner of ["owner-a", "owner-b"]) {
    switchOwner(owner);
    for (const step of steps) {
      const routineId = session.weeklyGrowthSessionRoutineId(owner, step);
      ids.push(routineId);
      const row = await routines.createRoutineFromRecommendation(owner, "daily_focus", {
        title: "Next step", reason: "Observation", recurrence: "daily",
      }, { routineId });
      expect(row.id).toBe(routineId);
    }
  }
  expect(new Set(ids).size).toBe(14);
  expect(mockUpsert).toHaveBeenCalledTimes(14);
});

test("R2260-01 public owner and step inputs cannot predict the next process session UUID", () => {
  const first = session.weeklyGrowthSessionRoutineId("owner-a", "work");
  startProcess();
  expect(session.weeklyGrowthSessionRoutineId("owner-a", "work")).not.toBe(first);
});

test("account switching clears old UUIDs even without an intermediate account save", () => {
  const first = session.weeklyGrowthSessionRoutineId("owner-a", "work");
  switchOwner("owner-b");
  switchOwner("owner-a");
  expect(session.weeklyGrowthSessionRoutineId("owner-a", "work")).not.toBe(first);
});

test("sign-out and return retire the previous session UUID", () => {
  const first = session.weeklyGrowthSessionRoutineId("owner-a", "work");
  switchOwner(null);
  expect(() => session.weeklyGrowthSessionRoutineId("owner-a", "work")).toThrow("owner changed");
  switchOwner("owner-a");
  expect(session.weeklyGrowthSessionRoutineId("owner-a", "work")).not.toBe(first);
});

test("pending account transitions and stale owners cannot retrieve UUIDs", () => {
  session.weeklyGrowthSessionRoutineId("owner-a", "work");
  account.beginAccountOwnerTransition("owner-b");
  expect(() => session.weeklyGrowthSessionRoutineId("owner-a", "work")).toThrow("owner changed");
  switchOwner("owner-b");
  expect(() => session.weeklyGrowthSessionRoutineId("owner-a", "work")).toThrow("owner changed");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("the ref blocks concurrent callbacks and unlocks after failure", async () => {
  const ref = { current: false };
  const pending = deferred<void>();
  const save = jest.fn(() => pending.promise);
  const first = session.runWeeklyGrowthSave(ref, save);
  const second = session.runWeeklyGrowthSave(ref, save);
  const result = Promise.allSettled([first, second]);
  expect(ref.current).toBe(true);
  pending.reject(new Error("lost response"));
  expect(await result).toEqual([
    { status: "rejected", reason: new Error("lost response") },
    { status: "fulfilled", value: false },
  ]);
  expect(save).toHaveBeenCalledTimes(1);
  expect(ref.current).toBe(false);
  await expect(session.runWeeklyGrowthSave(ref, async () => {})).resolves.toBe(true);
});

const screen = readFileSync(resolve(__dirname, "../../../screens/deepspace/growth/WeeklyGrowthScreen.tsx"), "utf8");
const handler = screen.slice(screen.indexOf("const saveStep = async () =>"), screen.indexOf("\n  return (", screen.indexOf("const saveStep = async () =>")));
const handlerJs = ts.transpileModule(`${handler}\nsaveStep;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function mountSave({
  create = jest.fn().mockResolvedValue(undefined), list = jest.fn().mockResolvedValue([]),
  owner = "owner-a", step = "work", saved = false,
}: { create?: jest.Mock; list?: jest.Mock; owner?: string | null; step?: SevenStarId | null; saved?: boolean } = {}) {
  const savingRef = { current: false };
  const mounted = { current: true };
  const setSaved = jest.fn();
  // Execute the production event handler without an RN renderer.
  const save = runInNewContext(handlerJs, {
    userId: owner, top: step ? { id: step } : null, saved, savingRef, mounted, setSaved,
    ...session, captureAccountOwnerLease: account.captureAccountOwnerLease,
    createRoutineFromRecommendation: create, listActiveRoutines: list,
    STEP_DOMAIN: { work: "career_check", now: "daily_focus" }, stepText: () => "Next step", stepObs: () => "Observation",
  }) as () => Promise<void>;
  return { save, savingRef, mounted, setSaved, create, list };
}
const existingRoutine = (patch: Partial<OpsRoutine> = {}): OpsRoutine => ({
  id: "old-server-issued-id", user_id: "owner-a", domain_id: "career_check", title: "Next step",
  reason: null, recurrence: "daily", reminder_time: "09:00", weekday: null,
  duration_minutes: null, checklist: [], active: true, created_at: "2026-10-10T00:00:00Z", ...patch,
});

test.each([
  ["no rows", []],
  ["R2260-02 same-title daily routine from another screen", [existingRoutine()]],
] as const)("%s sends one save without reading routines", async (_label, rows) => {
  const view = mountSave({ list: jest.fn().mockResolvedValue(rows) });
  await view.save();
  expect(view.list).not.toHaveBeenCalled();
  expect(view.create).toHaveBeenCalledTimes(1);
  expect(view.create).toHaveBeenCalledWith("owner-a", "career_check", expect.objectContaining({
    title: "Next step", recurrence: "daily",
  }), { routineId: session.weeklyGrowthSessionRoutineId("owner-a", "work") });
  expect(new Date(view.create.mock.calls[0][2].startsAtIso).getHours()).toBe(9);
  expect(view.setSaved).toHaveBeenCalledWith(true);
});

test("saving has no dependency on routine-list availability", async () => {
  const view = mountSave({ list: jest.fn(() => { throw new Error("unexpected routine read"); }) });
  await view.save();
  expect(view.list).not.toHaveBeenCalled();
  expect(view.create).toHaveBeenCalledTimes(1);
  expect(view.setSaved).toHaveBeenCalledWith(true);
});

test("the ref locks before the first await: a second tap adds zero save requests", async () => {
  expect(screen).toContain("const savingRef = useRef(false);");
  const pending = deferred<void>();
  const view = mountSave({ create: jest.fn(() => pending.promise) });
  const first = view.save();
  expect(view.savingRef.current).toBe(true);
  expect(view.create).toHaveBeenCalledTimes(1);
  const second = view.save();
  expect(view.create).toHaveBeenCalledTimes(1);
  expect(view.setSaved).not.toHaveBeenCalled();
  pending.resolve();
  await Promise.all([first, second]);
  expect(view.list).not.toHaveBeenCalled();
  expect(view.create).toHaveBeenCalledTimes(1);
  expect(view.setSaved).toHaveBeenCalledTimes(1);
  expect(view.savingRef.current).toBe(false);
});

test("a thrown save, retry and navigation retain the session UUID", async () => {
  const create = jest.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(undefined);
  const view = mountSave({ create });
  await view.save();
  expect(view.setSaved).not.toHaveBeenCalled();
  expect(view.savingRef.current).toBe(false);
  await view.save();
  expect(view.setSaved).toHaveBeenCalledWith(true);
  await mountSave({ create }).save();
  expect(create).toHaveBeenCalledTimes(3);
  const firstId = create.mock.calls[0][3].routineId;
  for (const call of create.mock.calls) expect(call[3]).toEqual({ routineId: firstId });
  await mountSave({ create, step: "now" }).save();
  switchOwner("owner-b");
  await mountSave({ create, owner: "owner-b" }).save();
  expect(create.mock.calls[3][3].routineId).not.toBe(firstId);
  expect(create.mock.calls[4][3].routineId).not.toBe(firstId);
});

test("a committed save with a lost response converges to one row on retry and remount", async () => {
  const create = jest.fn(routines.createRoutineFromRecommendation);
  const view = mountSave({ create });
  mockLoseResponse = true;
  await view.save();
  expect(mockRows.size).toBe(1);
  expect(view.setSaved).not.toHaveBeenCalled();
  await view.save();
  await mountSave({ create }).save();
  expect(mockUpsert).toHaveBeenCalledTimes(3);
  expect(mockRows.size).toBe(1);
  expect(mockListSelect).not.toHaveBeenCalled();
  expect(view.setSaved).toHaveBeenCalledWith(true);
});

test.each(["process restart", "account round trip", "legacy server ID"])(
  "known scope limit: %s can add another row", async scenario => {
    if (scenario === "legacy server ID") {
      mockRows.set("old-server-issued-id", { ...existingRoutine() });
    } else {
      await mountSave({ create: jest.fn(routines.createRoutineFromRecommendation) }).save();
      if (scenario === "process restart") startProcess();
      else { switchOwner("owner-b"); switchOwner("owner-a"); }
    }
    expect(mockRows.size).toBe(1);
    const view = mountSave({ create: jest.fn(routines.createRoutineFromRecommendation) });
    await view.save();
    expect(mockRows.size).toBe(2);
    expect(mockListSelect).not.toHaveBeenCalled();
    expect(view.setSaved).toHaveBeenCalledWith(true);
  },
);

test("the screen only imports the routine writer; session helpers never read routine lists", () => {
  expect(screen).toMatch(/import \{ createRoutineFromRecommendation \} from "@\/lib\/ops\/routines"/);
  expect(screen).not.toContain("listActiveRoutines");
  const helper = readFileSync(resolve(__dirname, "../routine-save.ts"), "utf8");
  expect(helper).not.toMatch(/ops\/routines|supabase/);
});

test("owner change during upsert cannot mark the old view saved", async () => {
  const pending = deferred<void>();
  const entered = deferred<void>();
  const view = mountSave({ create: jest.fn(() => { entered.resolve(); return pending.promise; }) });
  const saving = view.save();
  await entered.promise;
  switchOwner("owner-b");
  pending.resolve();
  await saving;
  expect(view.setSaved).not.toHaveBeenCalled();
});

test("unmounted save completion does not update state", async () => {
  const write = deferred<void>();
  const view = mountSave({ create: jest.fn(() => write.promise) });
  expect(view.list).not.toHaveBeenCalled();
  const pending = view.save();
  view.mounted.current = false;
  write.resolve();
  await pending;
  expect(view.setSaved).not.toHaveBeenCalled();
});

test.each([{ saved: true }, { owner: null }, { step: null }, { owner: "owner-b" }])(
  "unavailable or saved confirmations make zero requests (%j)", async options => {
    const view = mountSave(options);
    await view.save();
    expect(view.list).not.toHaveBeenCalled();
    expect(view.create).not.toHaveBeenCalled();
    expect(view.setSaved).not.toHaveBeenCalled();
  },
);

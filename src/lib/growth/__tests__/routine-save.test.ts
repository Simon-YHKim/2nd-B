import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { runWeeklyGrowthSave, weeklyGrowthRoutineId } from "../routine-save";
import type { SevenStarId } from "../../persona/seven-stars";

// The shared Expo mock uses SHA-1 for every algorithm. Exercise the selected SHA-256 here.
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (algorithm: string, text: string) => createHash(algorithm.toLowerCase().replace("-", "")).update(text).digest("hex"),
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
test("Q-261011-06 same account and step have a stable v4-shaped ID across mounts", async () => {
  const first = await weeklyGrowthRoutineId("owner-a", "work");
  expect(first).toMatch(UUID);
  expect(await weeklyGrowthRoutineId("owner-a", "work")).toBe(first);
  // Freeze the namespace/encoding: changing either in a later release would duplicate old rows.
  expect(first).toBe("0e2573dc-6ed1-4787-a20d-c9fe6d453b25");
});

test("all seven steps and another account have independent IDs", async () => {
  const steps: SevenStarId[] = ["profile", "infancy", "school", "twenties", "later", "work", "now"];
  const ids = await Promise.all(["owner-a", "owner-b"].flatMap(owner => steps.map(step => weeklyGrowthRoutineId(owner, step))));
  expect(new Set(ids).size).toBe(14);
  for (const id of ids) expect(id).toMatch(UUID);
});

test("the ref blocks a second call before the first await settles and unlocks after failure", async () => {
  const ref = { current: false };
  let fail!: (error: Error) => void;
  const pending = new Promise<void>((_, reject) => { fail = reject; });
  const save = jest.fn(() => pending);
  const first = runWeeklyGrowthSave(ref, save);
  expect(ref.current).toBe(true);
  const second = runWeeklyGrowthSave(ref, save);
  expect(save).toHaveBeenCalledTimes(1);
  await expect(second).resolves.toBe(false);
  fail(new Error("lost response"));
  await expect(first).rejects.toThrow("lost response");
  expect(ref.current).toBe(false);
  await expect(runWeeklyGrowthSave(ref, async () => {})).resolves.toBe(true);
  expect(ref.current).toBe(false);
});

const screen = readFileSync(resolve(__dirname, "../../../screens/deepspace/growth/WeeklyGrowthScreen.tsx"), "utf8");
const handler = screen.slice(screen.indexOf("const saveStep = async () =>"), screen.indexOf("\n  return (", screen.indexOf("const saveStep = async () =>")));
function mountSave(create: jest.Mock, owner = "owner-a", step: SevenStarId = "work") {
  const savingRef = { current: false };
  const setSaved = jest.fn();
  const save = runInNewContext(ts.transpileModule(`${handler}\nsaveStep;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    userId: owner, top: { id: step }, saved: false, savingRef, setSaved,
    runWeeklyGrowthSave, weeklyGrowthRoutineId, createRoutineFromRecommendation: create,
    STEP_DOMAIN: { work: "career_check", now: "daily_focus" }, stepText: () => "Next step", stepObs: () => "Observation",
  }) as () => Promise<void>;
  return { save, savingRef, setSaved };
}

test("the screen uses a ref and its real handler sends zero extra requests on double tap", async () => {
  expect(screen).toContain("const savingRef = useRef(false);");
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const create = jest.fn(() => pending);
  const mounted = mountSave(create);
  const first = mounted.save();
  await mounted.save();
  // Hashing is asynchronous too; both presses have reached their first await.
  expect(create).toHaveBeenCalledTimes(1);
  expect(mounted.setSaved).not.toHaveBeenCalled();
  finish();
  await first;
  expect(mounted.setSaved).toHaveBeenCalledWith(true);
  expect(mounted.savingRef.current).toBe(false);
});

test("the real screen handler retries and remounts with the same ID, while other steps/accounts differ", async () => {
  const create = jest.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(undefined);
  const mounted = mountSave(create);
  await mounted.save();
  expect(mounted.setSaved).not.toHaveBeenCalled();
  await mounted.save();
  await mountSave(create).save();
  await mountSave(create, "owner-a", "now").save();
  await mountSave(create, "owner-b").save();
  const expected = await weeklyGrowthRoutineId("owner-a", "work");
  for (const call of create.mock.calls.slice(0, 3)) expect(call[3]).toEqual({ routineId: expected });
  expect(create.mock.calls[3][3].routineId).not.toBe(expected);
  expect(create.mock.calls[4][3].routineId).not.toBe(expected);
  expect(create.mock.calls[0][2].recurrence).toBe("daily");
  expect(new Date(create.mock.calls[0][2].startsAtIso).getHours()).toBe(9);
});

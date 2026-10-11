import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner, __resetAccountEpochForTests } from "../../auth/account-epoch";
import { beginPrivacyChange } from "../../privacy/changes";
import { writeViewMemory } from "../../nav/view-memory";
import { opsRecommendationRoutineId, readOpsPresentation, writeOpsPresentationFor, type OpsPresentation } from "../presentation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const snapshot = (): OpsPresentation => ({
  group: null, domain: "reading_list", adherence: null, savedKeys: [],
  recommendations: [{ title: "Read", reason: "A chapter" }, { title: "Read", reason: "A chapter" }],
});
const idFor = (view: OpsPresentation, index = 0, owner = "owner-a") =>
  opsRecommendationRoutineId(owner, view.domain!, view.recommendations, index);

beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("owner-a"); });

test("Q-261011-06 same card keeps its UUID through retries and screen remounts", () => {
  const view = snapshot();
  writeOpsPresentationFor("owner-a", view);
  const first = idFor(view)!;
  expect(first).toMatch(UUID);
  expect(idFor(view)).toBe(first);
  // The screen writes state again and later restores the same list from session memory.
  writeOpsPresentationFor("owner-a", { ...view, savedKeys: ["reading_list:1"] });
  const remounted = readOpsPresentation();
  expect(idFor(remounted)).toBe(first);
  expect(idFor(remounted, 1)).toMatch(UUID);
  expect(idFor(remounted, 1)).not.toBe(first);
});

test("a fresh recommendation list gets fresh IDs even for identical text and positions", () => {
  const view = snapshot();
  writeOpsPresentationFor("owner-a", view);
  const first = idFor(view);
  const next = snapshot();
  writeOpsPresentationFor("owner-a", next);
  expect(idFor(next)).not.toBe(first);
  expect(idFor(view)).toBeNull();
});

test("a changed domain cannot reuse a routine from the same position", () => {
  const view = snapshot();
  writeOpsPresentationFor("owner-a", view);
  const first = idFor(view);
  const next: OpsPresentation = { ...readOpsPresentation(), domain: "home_reset" };
  writeOpsPresentationFor("owner-a", next);
  expect(idFor(next)).not.toBe(first);
  expect(idFor(view)).toBeNull();
});

test("privacy clearing discards IDs and a rebuilt list cannot overwrite the old routine", () => {
  const view = snapshot();
  writeOpsPresentationFor("owner-a", view);
  const first = idFor(view);
  beginPrivacyChange("owner-a", { recommendations: false });
  expect(readOpsPresentation().routineIds).toBeUndefined();
  expect(idFor(view)).toBeNull();
  writeOpsPresentationFor("owner-a", view);
  expect(idFor(view)).not.toBe(first);
});

test("account transitions discard IDs, including IDs carried by a stale caller", () => {
  const view = snapshot();
  writeOpsPresentationFor("owner-a", view);
  const prior = readOpsPresentation();
  const first = idFor(prior);
  beginAccountOwnerTransition("owner-b");
  noteResolvedOwner("owner-b");
  clearAccountTransition(currentAccountEpoch());
  writeOpsPresentationFor("owner-a", prior);
  expect(idFor(prior)).toBeNull();
  writeOpsPresentationFor("owner-b", prior);
  expect(idFor(prior, 0, "owner-b")).toMatch(UUID);
  expect(idFor(prior, 0, "owner-b")).not.toBe(first);
});

test("legacy snapshots without IDs are readable and gain an ID before the first request", () => {
  const legacy = snapshot();
  writeViewMemory("ops-presentation", legacy); // fixture for the pre-upgrade shape
  expect(readOpsPresentation()).toEqual(legacy);
  const first = idFor(legacy)!;
  expect(first).toMatch(UUID);
  expect(readOpsPresentation().routineIds?.[0]).toBe(first);
  expect(idFor(legacy)).toBe(first);
  expect(idFor(legacy, -1)).toBeNull();
});

// Execute the real event handler, without loading React Native or a renderer.
const screen = readFileSync(resolve(__dirname, "../../../screens/deepspace/dds-ops-screen.tsx"), "utf8");
const handler = screen.slice(screen.indexOf("async function saveRoutine("), screen.indexOf("\n  async function", screen.indexOf("async function saveRoutine(") + 1));
test("the card handler passes its persisted ID on lost-response retry and after leaving mid-save", async () => {
  const view = snapshot();
  writeOpsPresentationFor("owner-a", view);
  const create = jest.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValue({ id: "saved" });
  const save = runInNewContext(ts.transpileModule(`${handler}\nsaveRoutine;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    userId: "owner-a", domain: view.domain, recommendations: view.recommendations,
    savingKey: null, savedKeys: new Set(), opsRecommendationRoutineId,
    setSavingKey: jest.fn(), setNotice: jest.fn(), isCurrentOwner: () => false,
    createRoutineFromRecommendation: create,
  }) as (rec: OpsPresentation["recommendations"][number], key: string) => Promise<void>;
  await save(view.recommendations[0], "reading_list:0");
  await save(view.recommendations[0], "reading_list:0");
  expect(create).toHaveBeenCalledTimes(2);
  for (const call of create.mock.calls) expect(call[3]).toEqual({ routineId: idFor(view) });
  expect(readOpsPresentation().routineIds?.[0]).toBe(idFor(view));
});

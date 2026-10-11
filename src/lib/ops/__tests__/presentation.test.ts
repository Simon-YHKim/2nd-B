import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beginAccountOwnerTransition, clearAccountTransition, currentAccountEpoch, noteResolvedOwner, __resetAccountEpochForTests } from "../../auth/account-epoch";
import { readOpsPresentation, writeOpsPresentationFor, type OpsPresentation } from "../presentation";

const EMPTY: OpsPresentation = { group: null, domain: null, recommendations: [], adherence: null, savedKeys: [] };
const snapshot = (title: string): OpsPresentation => ({
  group: null, domain: null, adherence: null, savedKeys: ["health:0"],
  recommendations: [{ title, reason: "because" }],
});
function switchTo(owner: string): void {
  beginAccountOwnerTransition(owner);
  noteResolvedOwner(owner);
  clearAccountTransition(currentAccountEpoch());
}

beforeEach(() => { __resetAccountEpochForTests(); noteResolvedOwner("qa-a"); });

describe("AS-02: an ops snapshot is written only for the account it was loaded for", () => {
  test("the signed-in account's own snapshot is kept", () => {
    writeOpsPresentationFor("qa-a", snapshot("A walk"));
    expect(readOpsPresentation()).toEqual(snapshot("A walk"));
  });

  test("a snapshot loaded for the previous account never lands in the next account's memory", () => {
    writeOpsPresentationFor("qa-a", snapshot("A walk"));
    switchTo("qa-b");
    expect(readOpsPresentation()).toEqual(EMPTY);
    // The screen can render once for qa-b while its state still holds qa-a's recommendations.
    writeOpsPresentationFor("qa-a", snapshot("A walk"));
    expect(readOpsPresentation()).toEqual(EMPTY);
    writeOpsPresentationFor("qa-b", snapshot("B stretch"));
    expect(readOpsPresentation()).toEqual(snapshot("B stretch"));
  });

  test("a snapshot for another or no account leaves the current one untouched", () => {
    writeOpsPresentationFor("qa-a", snapshot("A walk"));
    writeOpsPresentationFor("qa-b", snapshot("B stretch"));
    writeOpsPresentationFor(null, snapshot("nobody"));
    expect(readOpsPresentation()).toEqual(snapshot("A walk"));
  });
});

// Source contract instead of a renderer: the screen must route every write through the owner check.
const screen = readFileSync(resolve(__dirname, "../../../screens/deepspace/dds-ops-screen.tsx"), "utf8");

test("the ops screen tags its state with the account it was loaded for and writes only that", () => {
  expect(screen).not.toMatch(/\bwriteOpsPresentation\(/);
  const reset = screen.slice(screen.indexOf("runRequestRef.current += 1;"), screen.indexOf("}, [userId]);"));
  expect(reset).toContain("const prior = readOpsPresentation();");
  expect(reset).toContain("setPresentationOwner(userId);");
  expect(screen).toMatch(/if \(userId && presentationOwner === userId && isCurrentOwner\(userId\)\)\s*writeOpsPresentationFor\(presentationOwner, \{/);
  expect(screen).toMatch(/\}, \[userId, presentationOwner, group, domain, recommendations, adherence, savedKeys, isCurrentOwner\]\);/);
  // The recommendation run writes for the account that asked, not whichever is signed in when it returns.
  expect(screen).toMatch(/writeOpsPresentationFor\(ownerId, \{ group, domain: selectedDomain, recommendations: result,/);
});

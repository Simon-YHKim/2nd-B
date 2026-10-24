import { readFileSync } from "node:fs";
import { createOpsSafetyReplay, loadOpsSafetySources, replayClaudeOpsSafety, type OpsSafetySample } from "../replay-claude-ops-safety";

type Result = Awaited<ReturnType<typeof replayClaudeOpsSafety>>;
const root = process.cwd();
let result: Result;
beforeAll(async () => {
  const network = jest.spyOn(global, "fetch").mockImplementation(() => { throw new Error("Host network forbidden"); });
  try { result = await replayClaudeOpsSafety(root); expect(network).not.toHaveBeenCalled(); }
  finally { network.mockRestore(); }
}, 30000);
const row = (id: string) => { const r = result.rows.find(r => r.id === id); if (!r) throw new Error(id); return r; };
function valid(): OpsSafetySample {
  return { id: "mutation", origin: "synthetic-test", locale: "en", minor: false, pref: true,
    snapshot: "Read a draft after lunch.", raw: row("valid-envelope-en").providerRaw };
}

test("replays the full boundary and real screen callback with all 80 safety inputs in both directions", () => {
  expect(result).toMatchObject({ liveCalls: 0, networkCalls: 0, productionWrites: 0, providerCost: 0, forbiddenAttempts: 0,
    modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false,
    counts: { rows: 185, fixtureConsumed: 132, skippedScreenGate: 9, inputRed: 44, outputRed: 44,
      screenErrors: 5, schemaFailures: { numerator: 87, denominator: 131 }, boundaryGuidanceLostAtScreen: 90 } });
  for (const direction of ["input", "output"]) expect(result.rows.filter(r => r.origin === `preparation-safety-${direction}`)).toHaveLength(80);
  expect(row("valid-envelope-en")).toMatchObject({ adapterCalls: 1, snapshotReads: 1, fixtureConsumed: true, usageBumps: 1,
    screen: { state: "idle", navigation: ["/dashboard?panel=recommendations"], observerSupplied: false, actualRendered: false } });
  expect(row("valid-envelope-en").screen.recommendations).toHaveLength(1);
  expect(row("valid-envelope-en").boundary?.events.map(e => e.kind)).toEqual(["proxy-request", "proxy-result", "semantic-unavailable", "audit"]);
  expect(row("invalid-json")).toMatchObject({ parsed: [], screen: { state: "empty", navigation: [] } });
  expect(row("synthetic-boundary-error")).toMatchObject({ error: "upstream_refusal", parsed: null, usageBumps: 0, screen: { state: "error" } });
});

test("input RED consumes no raw reply; output RED swaps and records memory audits but the current ops screen loses guidance", () => {
  const input = row("input:ko-direct:adult:ko"), output = row("output:ko-direct:adult:ko");
  expect(input).toMatchObject({ fixtureConsumed: false, boundary: { fixtureDispatches: 0, reply: { safety: { zone: "red" } } }, parsed: [], boundaryGuidanceLostAtScreen: true });
  expect(input.boundary?.events.map(e => e.kind)).toEqual(["audit", "crisis-event"]);
  expect(output).toMatchObject({ fixtureConsumed: true, boundary: { reply: { safety: { zone: "red" } } }, parsed: [],
    screen: { state: "empty", observerSupplied: false, guidancePublications: [] }, boundaryGuidanceLostAtScreen: true });
  expect(output.boundary?.reply?.audit.modelUsed).toContain("+swap:");
  expect(output.boundaryNumbers).toContain("109");
  expect(row("output:ko-direct:minor:ko").boundaryNumbers).toContain("1388");
  // Indirect phrases remaining green are observations, never a semantic PASS.
  expect(row("input:ko-indirect:adult:ko").fixtureConsumed).toBe(true);
});

test("keeps schema denominators and parser clamps from the original ops fixtures", () => {
  const old = result.rows.filter(r => r.origin === "existing-ops-corpus" && r.fixtureConsumed && r.boundary?.reply);
  expect(old).toHaveLength(12);
  expect(old.filter(r => r.strictSchemaIssues?.length)).toHaveLength(7);
  expect(row("legacy-array").screen.recommendations).toHaveLength(1);
  expect(row("clamped-items").screen.recommendations).toHaveLength(4);
  expect(row("clamped-items").screen.recommendations[0].title).toHaveLength(80);
  expect(row("plain-guidance").rawGuidanceLostAtScreen).toBe(true);
});

test("actual pref/read/limit gates avoid every fixture and memory write", () => {
  for (const id of ["pref-off", "pref-null", "pref-missing", "minor-server-locked-pref", "prefs-loading", "prefs-error", "usage-error", "daily-limit", "progression-loading"]) {
    expect(row(id)).toMatchObject({ adapterCalls: 0, snapshotReads: 0, fixtureConsumed: false, usageBumps: 0, memoryWrites: [] });
  }
  expect(row("pref-off").screen.state).toBe("off"); expect(row("daily-limit").screen.state).toBe("limit");
  expect(row("prefs-loading").screen.state).toBe("error");
});

test("owner/new request/actual privacy callback suppress stale presentation but do not erase the already-issued usage bump", () => {
  for (const id of ["owner-changed", "privacy-changed", "newer-request"]) {
    expect(row(id)).toMatchObject({ usageBumps: 1, screen: { recommendations: [], navigation: [] } });
    expect(row(id).memoryWrites).toEqual([{ kind: "usage-bump", ownerId: "synthetic:ops-safety" }]);
  }
  expect(row("privacy-changed").screen.state).toBe("idle");
});

test("in-memory boundary, parser and screen mutations change the measured behavior", async () => {
  const sources = loadOpsSafetySources(root), screen = "src/screens/deepspace/dds-ops-screen.tsx", boundary = "src/lib/llm/boundary.ts";
  const changedScreen = { ...sources, [screen]: sources[screen].replace('router.push("/dashboard?panel=recommendations"', 'router.push("/MUTATED"') };
  expect(changedScreen[screen]).not.toBe(sources[screen]);
  expect((await createOpsSafetyReplay(changedScreen).replay(valid())).screen.navigation).toEqual(["/MUTATED"]);
  const changedBoundary = { ...sources, [boundary]: sources[boundary].replace('if (outputZone === "red") {', 'if (false) {') };
  const direct = JSON.parse(readFileSync("scripts/claude-seat-measurement.corpus.json", "utf8")).safetyCases.find((r: {id: string}) => r.id === "ko-direct").text;
  const input = { ...valid(), locale: "ko" as const, raw: { content: [{ type: "text", text: direct }], stop_reason: "end_turn" } };
  const changed = await createOpsSafetyReplay(changedBoundary).replay(input);
  expect(changed.boundary?.reply?.text).toBe(direct);
  expect(changed.boundary?.reply?.audit.modelUsed).not.toContain("+swap:");
  const drifted = await replayClaudeOpsSafety(root, changedBoundary);
  expect(drifted).toMatchObject({ sourceReviewRequired: true, sourceChanges: [boundary] });
});

test("a swallowed network attempt inside the engine is fatal to the offline run", async () => {
  const sources = loadOpsSafetySources(root), file = "src/lib/ops/recommend.ts";
  const changed = { ...sources, [file]: sources[file].replace("const snapshot = await", 'try { fetch("https://offline.invalid"); } catch {}\nconst snapshot = await') };
  await expect(createOpsSafetyReplay(changed).replay(valid())).rejects.toThrow("forbidden capability");
});

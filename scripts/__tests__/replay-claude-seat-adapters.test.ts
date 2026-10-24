import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSeatReplay, loadSeatSources, replayClaudeSeatAdapters, SEAT_FILES, type SeatSample } from "../replay-claude-seat-adapters";
import { createOfflineRuntime, inspectSchema, sha, textSha } from "../lib/claude-offline-runtime";
import { createBoundaryReplay } from "../lib/claude-offline-boundary";
import { preparationOutputPath } from "../prepare-claude-seat-measurement";

const root = process.cwd();
const corpus = JSON.parse(readFileSync(join(root, "scripts/claude-seat-adapters.corpus.json"), "utf8")) as { cases: SeatSample[]; images: Record<string, string> };
type Result = Awaited<ReturnType<typeof replayClaudeSeatAdapters>>;
let result: Result;
beforeAll(async () => {
  const network = jest.spyOn(global, "fetch").mockImplementation(() => { throw new Error("Host network forbidden"); });
  try { result = await replayClaudeSeatAdapters(root); expect(network).not.toHaveBeenCalled(); }
  finally { network.mockRestore(); }
}, 30000);
const row = (id: string) => { const found = result.rows.find(r => r.id === id); if (!found) throw new Error(id); return found; };
const sample = (id: string) => { const found = corpus.cases.find(r => r.id === id); if (!found) throw new Error(id); return found; };

test("covers exactly the remaining 11 seats without claiming model quality, server activation or rendering", () => {
  expect([...new Set(result.rows.map(r => r.seat))].sort()).toEqual(Object.keys(SEAT_FILES).sort());
  expect(result).toMatchObject({ live: false, liveCalls: 0, networkCalls: 0, productionWrites: 0, providerCost: 0,
    forbiddenAttempts: 0, modelQualityVerdict: "NOT_MEASURED", semanticSafetyVerdict: "NOT_ESTABLISHED", appParityVerified: false,
    counts: { seats: 11, rows: 58, replayed: 50, errors: 7, skipped: 1 } });
  for (const [file, hash] of Object.entries(result.sourceSha256)) expect(hash).toBe(textSha(readFileSync(join(root, file), "utf8")));
  for (const seat of Object.keys(SEAT_FILES)) {
    expect(row(`${seat}-valid`)).toMatchObject({ status: "REPLAYED", error: null, actualScreenRendered: false });
    expect(row(`${seat}-valid`).consumerValue).not.toBeNull();
    expect(row(`${seat}-ko`).prompt?.system ?? row(`${seat}-ko`).prompt?.user).toBeTruthy();
  }
  expect(row("secondb_chat-valid").consumerValue).toMatchObject({ status: "ok", used: 1, remaining: 4,
    reply: { text: "The saved draft mentions asking a colleague for a review. There is too little evidence to infer a lasting pattern." } });
  expect(row("secondb_chat-valid").prompt?.system).toContain('type="wiki_snapshot"');
  expect(row("secondb_chat-valid").prompt?.system).toContain("synthetic:1");
  expect(JSON.stringify(row("secondb_chat-valid").consumerValue)).not.toContain("synthetic ignored block");
});

test("distinguishes strict schema failure, actual tolerant parser values and source fallback persistence", () => {
  expect(row("clipper_classify-fenced").strictSchemaIssues).toEqual(["$: invalid JSON"]);
  expect(row("clipper_classify-fenced").consumerValue).toEqual(row("clipper_classify-valid").consumerValue);
  expect(row("clipper_classify-coercion").consumerValue).toMatchObject({ kind: "inbox", track: "daily", simonRelevance: 1, props: {} });
  expect(row("clipper_classify-coercion").strictSchemaIssues).toHaveLength(2);
  expect(row("clipper_template_propose-malformed").consumerValue).toBeNull();
  const ingest = row("source_ingest-malformed");
  expect(ingest.parserValue).toBeNull();
  expect(ingest.consumerValue).toMatchObject({ summary: expect.stringContaining("offline preview"), generated_at: "2026-10-24T00:00:00.000Z" });
  expect(ingest.memoryWrites).toHaveLength(1);
  expect(row("source_ingest-valid").consumerValue).toMatchObject({ summary: "A team reviewed a draft.", questions: expect.any(Array) });
});

test("keeps grounded proposals, unchanged proposals and insufficient evidence distinct", () => {
  expect(row("self_model_propose-valid").consumerValue).toMatchObject({ targetLevel: 2, citations: ["synthetic:1"] });
  expect(row("self_model_propose-unchanged").consumerValue).toBeNull();
  expect(row("persona_synthesis-valid").consumerValue).toMatchObject([{ claimStrength: 1, evidence: { domains: ["work"], constructs: ["draft-review"] } }]);
  expect(row("persona_synthesis-ungrounded")).toMatchObject({ error: "polaris_no_grounded_result", consumerValue: null });
  expect(row("northstar_propose-valid").consumerValue).toHaveLength(3);
  expect(row("northstar_propose-malformed").error).toContain("unusable AI reply");
  expect(row("northstar_propose-thin")).toMatchObject({ status: "SKIPPED_LOCAL_GATE", prompt: null, consumerValue: null, boundary: [] });
});

test("runs board handler builder, provider decoding, server validation and app wire decoding", () => {
  for (const seat of ["daily_note", "day_summary", "inbox_triage"]) {
    expect(row(`${seat}-valid`)).toMatchObject({ providerOutcome: "completed", consumerValue: { ok: true, seat } });
    expect(row(`${seat}-fenced`).consumerValue).toEqual(row(`${seat}-valid`).consumerValue);
    expect(row(`${seat}-malformed`)).toMatchObject({ providerOutcome: "invalid_json", consumerValue: { ok: false } });
    expect(row(`${seat}-valid`).prompt?.system).toContain("Use only supplied evidence references");
    expect(row(`${seat}-valid`).prompt?.user).toContain("allowed_refs");
    expect(row(`${seat}-valid`).boundary).toEqual([]); // separate server route, never callLlm
  }
  for (const id of ["daily_note-unknown-reference", "day_summary-extra-field", "inbox_triage-duplicate-id"]) {
    expect(row(id)).toMatchObject({ providerOutcome: "rejected_output", parserValue: { kind: "unavailable" }, consumerValue: { ok: false } });
  }
  for (const reason of ["refusal", "max_tokens"]) {
    expect(row(`daily_note-${reason}`)).toMatchObject({ providerOutcome: "invalid_response", consumerValue: { ok: false } });
  }
});

test("replays real OCR payload/text guards against two non-personal PNGs without claiming recognition accuracy", () => {
  expect(Object.keys(corpus.images)).toHaveLength(2);
  for (const [file, hash] of Object.entries(corpus.images)) {
    const bytes = readFileSync(join(root, file));
    expect(sha(bytes)).toBe(hash);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(720); expect(bytes.readUInt32BE(20)).toBe(280);
  }
  expect(row("capture_ocr-mixed-table").consumerValue).toContain("초안 읽기 2 10:30");
  expect(row("capture_ocr-valid").prompt?.image?.mimeType).toBe("image/png");
  expect(row("capture_ocr-empty").error).toBe("image_ocr_empty_result");
  expect(row("capture_ocr-wrong-mime")).toMatchObject({ error: "image_ocr_invalid_data", prompt: null, boundary: [] });
});

test("preserves actual Claude envelope refusal/truncation and malformed-payload behavior", async () => {
  expect(row("secondb_chat-refusal").error).toBe("upstream_refusal");
  expect(row("secondb_chat-max_tokens").error).toBe("upstream_truncated");
  const sources = loadSeatSources(root), runtime = createOfflineRuntime(sources), boundary = createBoundaryReplay(runtime, sources);
  const bad = await boundary.replay({ userId: "synthetic", purpose: "ops_recommend", user: "Read a draft", locale: "en" },
    { content: [{ type: "text", text: 123 }], stop_reason: "end_turn" });
  expect(bad).toMatchObject({ error: "upstream_bad_payload", reply: null, fixtureDispatches: 1 });
});

test("source drift is reported without freezing unrelated changes; actual builder and parser execute", async () => {
  const sources = loadSeatSources(root), file = SEAT_FILES.self_model_propose;
  const changed = { ...sources, [file]: sources[file].replace("Current: ${currentValue}", "MUTATED: ${currentValue}") };
  expect(changed[file]).not.toBe(sources[file]);
  const drifted = await replayClaudeSeatAdapters(root, changed);
  expect(drifted).toMatchObject({ sourceReviewRequired: true, sourceChanges: [file] });
  expect(drifted.rows.find(r => r.id === "self_model_propose-valid")?.prompt?.user).toContain("MUTATED:");
  const parser = { ...sources, [file]: sources[file].replace("target, before, after, rationale", 'target, before, after: "MUTATED", rationale') };
  expect(parser[file]).not.toBe(sources[file]);
  expect((await createSeatReplay(parser).replay(sample("self_model_propose-valid"))).consumerValue).toMatchObject({ after: "MUTATED" });
  const missing = { ...sources, [file]: sources[file].replace("function proposeSelfModelChange(", "function missingEntry(") };
  await expect(replayClaudeSeatAdapters(root, missing)).rejects.toThrow("declaration drift");
});

test("denies swallowed network/module access, unknown schema rules and live flags", async () => {
  const sources = loadSeatSources(root), file = SEAT_FILES.clipper_template_propose, current = sample("clipper_template_propose-valid");
  for (const code of ['fetch("https://offline.invalid")', 'require("node:https")']) {
    const changed = { ...sources, [file]: sources[file].replace("const trimmed = content.trim();", `try { ${code}; } catch {}\nconst trimmed = content.trim();`) };
    await expect(createSeatReplay(changed).replay(current)).rejects.toThrow("forbidden capability");
  }
  expect(() => inspectSchema('{}', { type: "OBJECT", properties: {}, maxProperties: 1 })).toThrow("Unsupported");
  for (const arg of ["--live", "--model=anything", "--vendor=claude", "--url=https://offline.invalid"]) expect(() => preparationOutputPath([arg])).toThrow("cannot make live calls");
});

test("source fingerprints survive CRLF versus LF checkouts", () => {
  for (const [file, hash] of Object.entries(result.sourceSha256)) {
    const text = readFileSync(join(root, file), "utf8");
    expect(textSha(text.replace(/\r?\n/g, "\r\n"))).toBe(hash);
    expect(textSha(text.replace(/\r\n/g, "\n"))).toBe(hash);
  }
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createOfflineInterviewRuntime, loadInterviewAdapterSources, replayClaudeInterviewAdapter } from "../replay-claude-interview-adapter";
import { preparationOutputPath } from "../prepare-claude-seat-measurement";

const root = process.cwd();
const corpus = JSON.parse(readFileSync(join(root, "scripts/claude-interview-adapter.corpus.json"), "utf8"));
type Result = Awaited<ReturnType<typeof replayClaudeInterviewAdapter>>;
let result: Result;

beforeAll(async () => {
  const network = jest.spyOn(global, "fetch").mockImplementation(() => { throw new Error("Host network forbidden"); });
  try {
    result = await replayClaudeInterviewAdapter(root);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
}, 30000);

const row = (id: string) => {
  const found = result.rows.find((sample) => sample.id === id);
  if (!found) throw new Error(`Missing fixture ${id}`);
  return found;
};

test("keeps one of ten candidate adapters separate from live model quality and fingerprints actual sources/builders", () => {
  expect(result.live).toBe(false);
  expect(result.liveCalls).toBe(0);
  expect(result.forbiddenAttempts).toBe(0);
  expect(result.counts).toMatchObject({ rows: 32, inputRedSkipped: 2, replayed: 30, safetyLossRows: 0 });
  expect(result.historicalGuidanceLoss.ids).toHaveLength(10);
  expect(result.modelQualityVerdict).toBe("NOT_MEASURED");
  expect(result.adapters).toMatchObject({ candidateSeats: 10, ready: ["interview_probe"] });
  const probeSource = readFileSync(join(root, "src/lib/interview/probe.ts"), "utf8");
  expect(result.sourceSha256["src/lib/interview/probe.ts"]).toBe(createHash("sha256").update(probeSource).digest("hex"));
  const ordinary = row("t23-N1-baseline");
  expect(ordinary.prompt?.purpose).toBe("interview_probe");
  expect(ordinary.prompt?.system).toContain("시기 초점: 직장.");
  expect(ordinary.prompt?.user).toContain('<UNTRUSTED type="interview_transcript">');
  expect(ordinary.prompt?.user).toContain("동료들이 고개를 끄덕였어요");
  expect(ordinary.prompt?.schema).toMatchObject({ type: "OBJECT", required: ["answeredLayer", "question"] });
  expect(ordinary.screen?.visibleQuestion).toBe(ordinary.parsed?.question);
  expect(ordinary.screen?.guidanceIntent).toBeNull();
  expect(ordinary.checks?.verdict).toBe("REQUIRES_SEMANTIC_REVIEW");
});

test("does not deliver recorded replies past the current input-red gate and keeps age routing", () => {
  for (const [id, hotline] of [["synthetic-input-red-adult", "KR_109"], ["synthetic-input-red-minor", "KR_1388"]]) {
    expect(row(id)).toMatchObject({ status: "SKIPPED_INPUT_RED", adapterCalls: 0, liveCalls: 0, prompt: null,
      inputSafety: { zone: "red", crisisRouting: { hotline } } });
  }
});

test("restores none-judgement and long-answer guidance in the actual row without promoting the raw candidate", () => {
  const lost = row("t23-K2-candidate");
  expect(lost.rawNumbers).toEqual(expect.arrayContaining(["109", "1388"]));
  expect(lost.probe?.answeredLayer).toBeNull();
  expect(lost.probe?.question).not.toBe(lost.parsed?.question);
  expect(lost.screen).toMatchObject({ fixedFactScaffold: true, numbers: ["109", "119", "1388"], guidanceIntent: null,
    guidanceRow: { present: true } });
  expect(lost.checks).toMatchObject({ safetyGuidanceLoss: false, direct109Lost: false, verdict: "REQUIRES_SEMANTIC_REVIEW" });
  const long = row("t23-E2-candidate");
  expect(long.checks?.rawQuestionLength).toBeGreaterThan(320);
  expect(long.checks?.questionChangedByProbe).toBe(true);
  expect(long.screen?.fixedFactScaffold).toBe(true);
  expect(long.checks?.lostNumbers).not.toContain("988");
  expect(long.screen?.guidanceRow.text).toContain("In the US, you can call or text 988 for support. For other countries, use the helpline directory.");
  expect(result.historicalPairs.find((pair) => pair.group === "K1")).toMatchObject({ direct109Decreased: true, supportPreservationGateRelevant: true });
  expect(result.historicalPairs.find((pair) => pair.group === "K3")).toMatchObject({ supportPreservationGateRelevant: false });
});

test("records the actual red output swap and screen modal intent without calling it a rendered modal", () => {
  const adult = row("t23-K1-baseline"), minor = row("t23-K2-baseline");
  expect(adult.boundary?.safety.zone).toBe("red");
  expect(adult.screen).toMatchObject({ guidanceIntent: "KR_109", finished: true, actualModalRendered: false });
  expect(minor.screen).toMatchObject({ guidanceIntent: "KR_1388", finished: true });
  expect(minor.screen?.numbers).toEqual(["1388"]);
  expect(minor.screen?.modalNumberIntent).toBe("1388");
  // Raw 119 disappearing into a support modal is a numeric delta, not proof the modal is unsafe.
  expect(adult.checks).toMatchObject({ lostNumbers: ["119"], safetyGuidanceLoss: false });
});

test.each(["t23-N1-baseline", "t23-K1-baseline"])("optional turn metadata keeps legacy replay bytes: %s", async id => {
  const sources = loadInterviewAdapterSources(root);
  const boundaryPath = "src/lib/llm/boundary.ts";
  const legacyBoundary = sources[boundaryPath].replace(/^[ \t]*\.\.\.\(turn(?:Admission|Bound)[^\r\n]*\r?\n/gm, "");
  expect(legacyBoundary).not.toBe(sources[boundaryPath]);
  const sample = corpus.cases.find((entry: { id: string }) => entry.id === id);
  const legacy = await createOfflineInterviewRuntime({ ...sources, [boundaryPath]: legacyBoundary }).replay(sample);
  const current = row(id);
  expect(JSON.stringify(current.boundary)).toBe(JSON.stringify(legacy.boundary));
  expect(JSON.stringify(current.screen)).toBe(JSON.stringify(legacy.screen));
  expect(current.boundary).not.toHaveProperty("turnAdmission");
  expect(current.boundary).not.toHaveProperty("turnBound");
});

test("runs the current request refs and real finish, publishing once before the boundary audit", () => {
  const replayed = result.rows.filter(sample => sample.status === "REPLAYED_CURRENT_CODE");
  expect(replayed).toHaveLength(30);
  for (const sample of replayed) expect(sample.screen).toMatchObject({ requestSequence: 1, busy: false });
  for (const id of ["t23-K1-baseline", "t23-K2-baseline"]) {
    expect(row(id).screen).toMatchObject({ publicationAttempts: 1, finishCalls: 1,
      finished: true, ended: true, pendingLayer: null, openers: [],
      effects: ["root-notice", "finish", "audit", "crisis-event"] });
  }
  expect(result.extractionSha256.screenFinish).toMatch(/^[a-f0-9]{64}$/);
  // The historical losses remain GREEN; the actual shared row now supplies their copy.
  expect(result.historicalGuidanceLoss.ids.map(id => row(id).boundary?.safety.zone))
    .toEqual(Array(10).fill("green"));
});

test("callback forwarding and finish source changes are observed by the actual replay", async () => {
  const sources = loadInterviewAdapterSources(root);
  const sample = corpus.cases.find((entry: { id: string }) => entry.id === "t23-K1-baseline");
  const probePath = "src/lib/interview/probe.ts", screenPath = "src/app/interview.tsx";
  const noEarlyForward = { ...sources, [probePath]: sources[probePath].replace(/    onCrisisDetected,\r?\n/, "") };
  expect(noEarlyForward[probePath]).not.toBe(sources[probePath]);
  const finalOnly = await createOfflineInterviewRuntime(noEarlyForward).replay(sample);
  expect(finalOnly.screen?.effects).toEqual(["audit", "crisis-event", "root-notice", "finish"]);
  const changedFinish = { ...sources, [screenPath]: sources[screenPath].replace("    setDone(true);", "    setDone(false);") };
  expect(changedFinish[screenPath]).not.toBe(sources[screenPath]);
  expect((await createOfflineInterviewRuntime(changedFinish).replay(sample)).screen)
    .toMatchObject({ finished: false, ended: true, pendingLayer: null, publicationAttempts: 1 });
  const missingRef = { ...sources, [screenPath]: sources[screenPath].replace("const instance = action.instance;", "const instance = missingInstance.current;") };
  await expect(createOfflineInterviewRuntime(missingRef).replay(sample)).rejects.toThrow("missingInstance");
});

test("the erased CrisisObserver allowance grants no value import, extra type or network capability", () => {
  const sources = loadInterviewAdapterSources(root), path = "src/lib/interview/probe.ts";
  const approved = 'import type { CrisisObserver } from "../llm/types";';
  expect(sources[path]).toContain(approved);
  for (const replacement of [
    'import { CrisisObserver } from "../llm/types";',
    'import "../llm/types";',
    'import type { CrisisObserver, PromptInput } from "../llm/types";',
    'import type { CrisisObserver } from "node:https";',
  ]) {
    expect(() => createOfflineInterviewRuntime({ ...sources, [path]: sources[path].replace(approved, replacement) }))
      .toThrow("Adapter probe import drift");
  }
});

test("the optional guidance dependency permits only the approved value and erased type", () => {
  const sources = loadInterviewAdapterSources(root), path = "src/lib/interview/probe.ts";
  const approved = 'import { inspectProbeContactGuidance, type ProbeGuidance } from "./probe-guidance";';
  expect(sources[path]).toContain(approved);
  for (const file of ["src/lib/interview/probe-guidance.ts", "src/lib/interview/probe-contact-intent.ts"]) {
    expect(result.sourceSha256[file]).toBe(createHash("sha256").update(sources[file]).digest("hex"));
  }
  for (const replacement of [
    'import { inspectProbeContactGuidance, ProbeGuidance } from "./probe-guidance";',
    'import { inspectProbeContactGuidance, type ProbeGuidance, extra } from "./probe-guidance";',
    'import { inspectProbeContactGuidance as scan, type ProbeGuidance } from "./probe-guidance";',
    'import * as guidance from "./probe-guidance";',
    'import "./probe-guidance";',
    'import { inspectProbeContactGuidance, type ProbeGuidance } from "node:https";',
  ]) {
    expect(() => createOfflineInterviewRuntime({ ...sources, [path]: sources[path].replace(approved, replacement) }))
      .toThrow("Adapter probe import drift");
  }
});

test("new pure modules still reject unapproved relative dependencies and network effects", async () => {
  const sources = loadInterviewAdapterSources(root), path = "src/lib/interview/probe-guidance.ts";
  const sample = corpus.cases.find((entry: { id: string }) => entry.id === "t23-N1-baseline");
  const addedModule = { ...sources, [path]: sources[path] + '\nimport "./probe-guidance-extra";\n',
    "src/lib/interview/probe-guidance-extra.ts": "export const extra = true;" };
  await expect(createOfflineInterviewRuntime(addedModule).replay(sample)).rejects.toThrow("Network/unsupported capability forbidden in offline adapter");
  const withNetwork = { ...sources, [path]: sources[path] + '\nfetch("https://offline.invalid");\n' };
  await expect(createOfflineInterviewRuntime(withNetwork).replay(sample)).rejects.toThrow("Network/unsupported capability forbidden in offline adapter");
});

test("distinguishes schema validity from parser acceptance, repeated questions, chips and line trimming", () => {
  expect(row("synthetic-invalid-json").strictSchemaIssues).toContain("$: expected object");
  expect(row("synthetic-missing-judgement").strictSchemaIssues).toContain("$.answeredLayer: required");
  for (const id of ["synthetic-invalid-json", "synthetic-missing-judgement"]) {
    expect(row(id).screen).toMatchObject({ lastUserAnswered: true, pendingLayer: "feeling", stuckStreak: 0,
      coverage: { work: { fact: 1 } }, notice: null });
    expect(row(id).checks?.verdict).toBe("BELOW_CRITERIA");
  }
  expect(row("synthetic-wrong-layer").screen).toMatchObject({ fixedFactScaffold: false, lastUserAnswered: null,
    pendingLayer: "fact", stuckStreak: 0, coverage: { work: { fact: 0 } }, notice: null, finished: false });
  expect(row("synthetic-wrong-layer").screen?.visibleQuestion).not.toBe(row("synthetic-wrong-layer").parsed?.question);
  expect(row("synthetic-repeated-question").checks?.questionChangedByProbe).toBe(true);
  expect(row("synthetic-opener-filter").probe?.openers).toEqual(["I felt...", "My thought..."]);
  expect(row("synthetic-multiline-guidance").checks).toMatchObject({ direct109Lost: false, safetyGuidanceLoss: false });
});

test("executes changed real builders, and fails closed on declaration drift or attempted network", async () => {
  const sources = loadInterviewAdapterSources(root);
  const path = "src/lib/interview/probe.ts";
  const sample = corpus.cases.find((entry: { id: string }) => entry.id === "t23-N1-baseline");
  const changed = { ...sources, [path]: sources[path].replace('`시기 초점: ${periodLabel}.`', '`검산 표식: ${periodLabel}.`') };
  expect((await createOfflineInterviewRuntime(changed).replay(sample)).prompt?.system).toContain("검산 표식: 직장.");
  expect(() => createOfflineInterviewRuntime({ ...sources, "src/app/interview.tsx": sources["src/app/interview.tsx"].replace("async function ask(", "async function renamedAsk(") })).toThrow("Adapter source drift: ask");
  expect(() => createOfflineInterviewRuntime({ ...sources, "src/app/interview.tsx": sources["src/app/interview.tsx"].replace("const finish = useCallback", "const renamedFinish = useCallback") })).toThrow("Adapter source drift: finish");
  const boundaryPath = "src/lib/llm/boundary.ts";
  expect(() => createOfflineInterviewRuntime({ ...sources, [boundaryPath]: sources[boundaryPath].replace("function crisisObserver(", "function renamedObserver(") })).toThrow("Adapter source drift: crisisObserver");
  const changedObserver = { ...sources, [boundaryPath]: sources[boundaryPath].replace("if (!observer) return undefined;", 'fetch("https://offline.invalid"); if (!observer) return undefined;') };
  await expect(createOfflineInterviewRuntime(changedObserver).replay(sample)).rejects.toThrow("forbidden capability");
  const withFetch = { ...sources, [path]: sources[path].replace("const transcript = history", 'fetch("https://offline.invalid"); const transcript = history') };
  await expect(createOfflineInterviewRuntime(withFetch).replay(sample)).rejects.toThrow("forbidden capability");
  const finishFetch = { ...sources, "src/app/interview.tsx": sources["src/app/interview.tsx"].replace("    setDone(true);", '    fetch("https://offline.invalid"); setDone(true);') };
  await expect(createOfflineInterviewRuntime(finishFetch).replay(corpus.cases.find((entry: { id: string }) => entry.id === "t23-K1-baseline")))
    .rejects.toThrow("forbidden capability");
  const imported = { ...sources, [path]: sources[path] + '\nimport "node:https";\n' };
  expect(() => createOfflineInterviewRuntime(imported)).toThrow("Adapter probe import drift");
  const newConstraint = { ...sources, [path]: sources[path].replace('question: { type: "STRING",', 'question: { type: "STRING", maxLength: 1,') };
  await expect(createOfflineInterviewRuntime(newConstraint).replay(sample)).rejects.toThrow("Unsupported schema constraint");
  const screenPath = "src/app/interview.tsx";
  const missingBinding = { ...sources, [screenPath]: sources[screenPath].replace('local(credited)', 'missingBinding(credited)') };
  const wrongLayer = corpus.cases.find((entry: { id: string }) => entry.id === "synthetic-wrong-layer");
  await expect(createOfflineInterviewRuntime(missingBinding).replay(wrongLayer)).rejects.toThrow("Adapter screen failed on a fixed reply");
  expect(() => preparationOutputPath(["--live"])).toThrow("cannot make live calls");
});


test("actual metadata is insufficient when acceptance or row text is removed", async () => {
  const sources = loadInterviewAdapterSources(root), screenPath = "src/app/interview.tsx";
  const rowPath = "src/components/interview/InterviewGuidanceRow.tsx";
  const noAcceptance = { ...sources, [screenPath]: sources[screenPath].replace("if (probe.guidance && canAcceptGuidance()", "if (false && probe.guidance && canAcceptGuidance()") };
  const noText = { ...sources, [rowPath]: sources[rowPath].replace("{block.body}", '{""}') };
  expect(noAcceptance[screenPath]).not.toBe(sources[screenPath]); expect(noText[rowPath]).not.toBe(sources[rowPath]);
  for (const changed of [noAcceptance, noText]) {
    const runtime = createOfflineInterviewRuntime(changed);
    for (const id of result.historicalGuidanceLoss.ids) {
      const sample = corpus.cases.find((entry: { id: string }) => entry.id === id);
      const replayed = await runtime.replay(sample);
      expect(replayed.probe?.guidance?.kind).toMatch(/contacts|unresolved/);
      expect(replayed.screen?.numbers).toEqual([]); expect(replayed.checks?.safetyGuidanceLoss).toBe(true);
    }
    expect(runtime.capabilities().forbiddenAttempts).toBe(0);
  }
});

test("moving the row out of the shared scroll or changing its actual binding fails closed", () => {
  const sources = loadInterviewAdapterSources(root), path = "src/app/interview.tsx";
  const current = sources[path];
  const mutations = [
    current.replace("{guidanceDisplay ? (", "<View>{guidanceDisplay ? (").replace("{done ? (", "</View>{done ? ("),
    current.replace('import { InterviewGuidanceRow }', 'import { InterviewGuidanceRow as DifferentRow }'),
    current.replace('import { resolveProbeGuidanceCopy }', 'import type { resolveProbeGuidanceCopy }'),
    current.replace('@/components/interview/InterviewGuidanceRow"', '@/components/interview/AnotherRow"'),
  ];
  for (const changed of mutations) {
    expect(changed).not.toBe(current);
    expect(() => createOfflineInterviewRuntime({ ...sources, [path]: changed })).toThrow(/placement drift|binding drift|screen binding/);
  }
});

test("only the exact row imports and two fixed copy JSON files are available offline", () => {
  const sources = loadInterviewAdapterSources(root), rowPath = "src/components/interview/InterviewGuidanceRow.tsx";
  const declared = 'import { Linking, StyleSheet } from "react-native";';
  for (const replacement of [
    '', 'import { Linking, StyleSheet, Platform } from "react-native";',
    'import { Linking as Network, StyleSheet } from "react-native";',
    'import "react-native";', 'import { Linking, StyleSheet } from "node:https";',
  ]) {
    expect(() => createOfflineInterviewRuntime({ ...sources, [rowPath]: sources[rowPath].replace(declared, replacement) }))
      .toThrow("Adapter guidance row import drift");
  }
  const copyPath = "src/lib/interview/probe-guidance-copy.ts";
  for (const dependency of ["locales/en/other.json", "locales/fr/safety.json", "node:https", "https://example.test/data"]) {
    const changed = `import * as forbidden from ${JSON.stringify(dependency.startsWith("locales/") ? `../../../${dependency}` : dependency)};\nvoid forbidden;\n${sources[copyPath]}`;
    expect(() => createOfflineInterviewRuntime({ ...sources, [copyPath]: changed, [dependency]: "{}" })).toThrow("forbidden");
  }
  for (const path of ["locales/en/safety.json", "locales/ko/safety.json", rowPath, copyPath]) {
    expect(result.sourceSha256[path]).toBe(createHash("sha256").update(sources[path]).digest("hex"));
  }
});

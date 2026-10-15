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
  expect(result.counts).toMatchObject({ rows: 32, inputRedSkipped: 2, replayed: 30, safetyLossRows: 10 });
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

test("reproduces T23 none-judgement and long-answer loss without promoting the failed candidate", () => {
  const lost = row("t23-K2-candidate");
  expect(lost.rawNumbers).toEqual(expect.arrayContaining(["109", "1388"]));
  expect(lost.probe?.answeredLayer).toBeNull();
  expect(lost.probe?.question).toBe(lost.parsed?.question);
  expect(lost.screen).toMatchObject({ fixedFactScaffold: true, numbers: [], guidanceIntent: null });
  expect(lost.checks).toMatchObject({ safetyGuidanceLoss: true, direct109Lost: true, verdict: "BELOW_CRITERIA" });
  const long = row("t23-E2-candidate");
  expect(long.checks?.rawQuestionLength).toBeGreaterThan(320);
  expect(long.checks?.questionChangedByProbe).toBe(true);
  expect(long.screen?.fixedFactScaffold).toBe(true);
  expect(long.checks?.lostNumbers).toContain("988");
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
  // A only changes already-confirmed RED delivery; every historical loss is GREEN.
  expect(result.rows.filter(sample => sample.checks?.safetyGuidanceLoss).map(sample => sample.boundary?.safety.zone))
    .toEqual(Array(10).fill("green"));
});

test("callback forwarding and finish source changes are observed by the actual replay", async () => {
  const sources = loadInterviewAdapterSources(root);
  const sample = corpus.cases.find((entry: { id: string }) => entry.id === "t23-K1-baseline");
  const probePath = "src/lib/interview/probe.ts", screenPath = "src/app/interview.tsx";
  const noEarlyForward = { ...sources, [probePath]: sources[probePath].replace("    onCrisisDetected,\n", "") };
  expect(noEarlyForward[probePath]).not.toBe(sources[probePath]);
  const finalOnly = await createOfflineInterviewRuntime(noEarlyForward).replay(sample);
  expect(finalOnly.screen?.effects).toEqual(["audit", "crisis-event", "root-notice", "finish"]);
  const changedFinish = { ...sources, [screenPath]: sources[screenPath].replace("    setDone(true);", "    setDone(false);") };
  expect(changedFinish[screenPath]).not.toBe(sources[screenPath]);
  expect((await createOfflineInterviewRuntime(changedFinish).replay(sample)).screen)
    .toMatchObject({ finished: false, ended: true, pendingLayer: null, publicationAttempts: 1 });
  const missingRef = { ...sources, [screenPath]: sources[screenPath].replace("const instance = interviewInstance.current;", "const instance = missingInstance.current;") };
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
  expect(row("synthetic-multiline-guidance").checks).toMatchObject({ direct109Lost: true, safetyGuidanceLoss: true });
});

test("executes changed real builders, and fails closed on declaration drift or attempted network", async () => {
  const sources = loadInterviewAdapterSources(root);
  const path = "src/lib/interview/probe.ts";
  const sample = corpus.cases.find((entry: { id: string }) => entry.id === "t23-N1-baseline");
  const changed = { ...sources, [path]: sources[path].replace('`시기 초점: ${periodLabel}.`', '`검산 표식: ${periodLabel}.`') };
  expect((await createOfflineInterviewRuntime(changed).replay(sample)).prompt?.system).toContain("검산 표식: 직장.");
  expect(() => createOfflineInterviewRuntime({ ...sources, "src/app/interview.tsx": sources["src/app/interview.tsx"].replace("const ask = useCallback", "const renamedAsk = useCallback") })).toThrow("Adapter source drift: ask");
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
  const missingBinding = { ...sources, [screenPath]: sources[screenPath].replace('usableQuestion("", assessed, credited, locale)', 'missingBinding("", assessed, credited, locale)') };
  const wrongLayer = corpus.cases.find((entry: { id: string }) => entry.id === "synthetic-wrong-layer");
  await expect(createOfflineInterviewRuntime(missingBinding).replay(wrongLayer)).rejects.toThrow("Adapter screen failed on a fixed reply");
  expect(() => preparationOutputPath(["--live"])).toThrow("cannot make live calls");
});
